import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { InAppNotificationProvider } from './providers/in-app-notification.provider';
import { NotificationProviderRegistry } from './providers/notification-provider.registry';
import { buildNotificationContent } from './notification-content';
import {
  MANDATORY_NOTIFICATION_TYPES, NOTIFICATION_TYPE, TOGGLEABLE_NOTIFICATION_TYPES, buildEventKey,
} from './notifications.constants';
import { NOTIFICATION_PROVIDER_NAME } from './notifications.constants';

describe('Notifications domain', () => {
  let prisma: any;
  let service: NotificationsService;
  const inApp = new InAppNotificationProvider();
  const registry = { provider: inApp, name: inApp.name, isExternal: false } as unknown as NotificationProviderRegistry;

  const notificationRow = (over: Record<string, unknown> = {}) => ({
    id: 'n1', type: 'ORDER_CREATED', channel: 'IN_APP', deliveryStatus: 'DELIVERED',
    title: 't', body: 'b', data: null, eventKey: 'ORDER_CREATED:order:1',
    readAt: null, deliveredAt: new Date(), createdAt: new Date('2026-09-16T00:00:00Z'),
    ...over,
  });

  beforeEach(() => {
    prisma = {
      notificationOutbox: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(notificationRow()),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'n-new' }),
        update: jest.fn().mockResolvedValue(notificationRow({ readAt: new Date() })),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        count: jest.fn().mockResolvedValue(5),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ type: 'LOW_STOCK', inAppEnabled: false, updatedAt: new Date() }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]) },
    };
    service = new NotificationsService(prisma as never, registry);
  });

  /* --------------------------- provider & registry -------------------------- */

  it('uses the in-app provider and never claims an external delivery', async () => {
    const result = await inApp.deliver({
      notificationId: 'n1', userId: 'u1', type: 'ORDER_CREATED', channel: 'IN_APP', title: 't', body: 'b',
    });
    expect(result.delivered).toBe(true);
    // a provider reference is never invented for a channel that has no external counterpart
    expect(result.providerReference).toBeNull();
  });

  it('ships no outbound integration in the notification module', () => {
    for (const file of [
      'providers/in-app-notification.provider.ts',
      'notification-content.ts',
      'notifications.service.ts',
    ]) {
      const code = readFileSync(join(__dirname, file), 'utf8');
      for (const forbidden of [
        'axios', 'HttpService', '@nestjs/axios', 'fetch(', 'https.request', 'http.request',
        'nodemailer', 'smtp', 'twilio', 'whatsapp', 'firebase', 'fcm', 'apns', 'API_KEY',
      ]) {
        expect(`${file} ~ ${forbidden}:${code.toLowerCase().includes(forbidden.toLowerCase())}`)
          .toBe(`${file} ~ ${forbidden}:false`);
      }
    }
  });

  it('resolves the configured provider strictly (no silent fallback)', () => {
    expect(() => new NotificationProviderRegistry([inApp])).not.toThrow();
    process.env.NOTIFICATION_PROVIDER = 'SMTP';
    expect(() => new NotificationProviderRegistry([inApp])).toThrow(/غير معروف/);
    delete process.env.NOTIFICATION_PROVIDER;
  });

  /* ------------------------------- generation ------------------------------ */

  it('enqueues an event into the outbox inside the caller transaction, idempotently', async () => {
    const tx = { notificationOutbox: { upsert: jest.fn().mockResolvedValue({}) } };
    await service.enqueue(tx as never, {
      type: NOTIFICATION_TYPE.ORDER_CREATED,
      aggregateType: 'order',
      aggregateId: 42,
      recipientUserId: 'u1',
      payload: { orderNumber: 'ORD-1', amount: '10.00' },
    });
    const call = tx.notificationOutbox.upsert.mock.calls[0][0];
    expect(call.where.eventType_aggregateType_aggregateId.aggregateId).toBe('42');
    // a repeated event is a no-op, never a second notification
    expect(call.update).toEqual({});
    expect(call.create.eventKey).toBe('ORDER_CREATED:order:42');
  });

  it('refuses an event with no recipient (no arbitrary broadcast)', async () => {
    const tx = { notificationOutbox: { upsert: jest.fn() } };
    await expect(service.enqueue(tx as never, {
      type: NOTIFICATION_TYPE.ORDER_CREATED, aggregateType: 'order', aggregateId: 1, payload: {},
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates the notification, delivers it in-app and marks the outbox processed', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob1', eventKey: 'ORDER_CREATED:order:7', eventType: 'ORDER_CREATED',
      payload: { orderNumber: 'ORD-7', amount: '20.00', currency: 'USD' },
      recipientUserId: 'u1', permissionKey: null, attempts: 0,
    }]);
    const outcome = await service.dispatch();
    expect(outcome).toEqual({ processed: 1, failed: 0 });
    const created = prisma.notification.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ userId: 'u1', channel: 'IN_APP', deliveryStatus: 'PENDING', provider: 'IN_APP' });
    expect(created.title).toContain('تم إنشاء طلبك');
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deliveryStatus: 'DELIVERED' }),
    }));
    expect(prisma.notificationOutbox.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PROCESSED' }),
    }));
  });

  it('deduplicates a repeated event: the same user + event yields one notification', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob1', eventKey: 'PAYMENT_CONFIRMED:payment:p1', eventType: 'PAYMENT_CONFIRMED',
      payload: { orderNumber: 'ORD-1' }, recipientUserId: 'u1', permissionKey: null, attempts: 0,
    }]);
    prisma.notification.findMany.mockResolvedValue([{ userId: 'u1' }]);
    const outcome = await service.dispatch();
    expect(outcome.processed).toBe(1);
    expect(prisma.notification.create).not.toHaveBeenCalled(); // same event ⇒ no second row
  });

  it('resolves staff recipients by permission, never by role name', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob2', eventKey: 'PAYMENT_REVIEW_REQUIRED:payment:p2:review', eventType: 'PAYMENT_REVIEW_REQUIRED',
      payload: { orderNumber: 'ORD-2' }, recipientUserId: null, permissionKey: 'payments.update', attempts: 0,
    }]);
    await service.dispatch();
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('payments.update');
    expect(JSON.stringify(where)).not.toContain('ADMIN');
    expect(prisma.notification.create).toHaveBeenCalledTimes(2); // one per permission holder
  });

  it('never notifies for a switchable type the user disabled, but always for mandatory ones', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob3', eventKey: 'LOW_STOCK:inventory:1:mv9', eventType: 'LOW_STOCK',
      payload: { productName: 'P', sku: 'S', available: 1, threshold: 5 },
      recipientUserId: 'u1', permissionKey: null, attempts: 0,
    }]);
    prisma.notification.findMany.mockResolvedValue([]); // not delivered yet
    prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'u1' }]); // u1 disabled this type
    await service.dispatch();
    expect(prisma.notification.create).not.toHaveBeenCalled();

    prisma.notification.create.mockClear();
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob4', eventKey: 'PAYMENT_CONFIRMED:payment:p3', eventType: 'PAYMENT_CONFIRMED',
      payload: { orderNumber: 'ORD-3' }, recipientUserId: 'u1', permissionKey: null, attempts: 0,
    }]);
    await service.dispatch();
    // transactional notification is mandatory: it is created even with the preference off
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('retries a failing row and gives up after maxAttempts without touching business data', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{
      id: 'ob5', eventKey: 'ORDER_CREATED:order:9', eventType: 'ORDER_CREATED',
      payload: { orderNumber: 'ORD-9' }, recipientUserId: 'u1', permissionKey: null, attempts: 2,
    }]);
    prisma.notification.create.mockRejectedValue(new Error('db down'));
    const outcome = await service.dispatch();
    expect(outcome.failed).toBe(1);
    const update = prisma.notificationOutbox.update.mock.calls[0][0].data;
    expect(update.status).toBe('FAILED');
    expect(update.lastError).toBe('تعذّر تجهيز الإشعار بعد عدة محاولات');
    expect(JSON.stringify(update)).not.toContain('db down'); // no internal error leaked
  });

  it('dispatch never throws into the business path', async () => {
    prisma.notificationOutbox.findMany.mockRejectedValue(new Error('boom'));
    await expect(service.dispatchSafely()).resolves.toBeUndefined();
    await expect(service.dispatch()).resolves.toEqual({ processed: 0, failed: 0 });
  });

  /* --------------------------------- inbox --------------------------------- */

  it('lists only the caller notifications with a database count', async () => {
    prisma.notification.findMany.mockResolvedValue([notificationRow()]);
    const result = await service.listMine('u1', {} as never);
    expect(prisma.notification.findMany.mock.calls[0][0].where.userId).toBe('u1');
    expect(result.items[0]).toMatchObject({ id: 'n1', read: false, deliveryStatus: 'DELIVERED' });
    expect(prisma.notification.count).toHaveBeenCalled();
    expect(result.meta.total).toBe(5);
  });

  it('hides another user notification as 404', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.findMine('n1', 'u2')).rejects.toThrow('الإشعار غير موجود');
    expect(prisma.notification.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u2' });
  });

  it('marks one notification read, idempotently (atomic conditional update)', async () => {
    // first call: the conditional update matched an unread row
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    prisma.notification.findUnique.mockResolvedValue(notificationRow({ readAt: new Date() }));
    const first = await service.markRead('n1', 'u1');
    expect(first.changed).toBe(true);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1', readAt: null });

    // second call: nothing left to update ⇒ changed=false, no duplicate effect
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const second = await service.markRead('n1', 'u1');
    expect(second.changed).toBe(false);
  });

  it('marks all read scoped to the caller and never globally', async () => {
    const result = await service.markAllRead('u1');
    const where = prisma.notification.updateMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: 'u1', readAt: null });
    expect(result.updated).toBe(3);
  });

  it('counts unread in the database', async () => {
    prisma.notification.count.mockResolvedValue(4);
    expect(await service.unreadCount('u1')).toEqual({ count: 4 });
  });

  /* ------------------------------ preferences ------------------------------ */

  it('returns deterministic defaults: mandatory on, others enabled by default', async () => {
    const result = await service.listPreferences('u1', {} as never);
    expect(result.items).toHaveLength(MANDATORY_NOTIFICATION_TYPES.length + TOGGLEABLE_NOTIFICATION_TYPES.length);
    for (const item of result.items) {
      expect(item.inAppEnabled).toBe(true);
      expect(item.explicit).toBe(false);
    }
    expect(result.items.find((i) => i.type === 'ORDER_CREATED')?.mandatory).toBe(true);
    expect(result.items.find((i) => i.type === 'LOW_STOCK')?.mandatory).toBe(false);
  });

  it('refuses to disable a mandatory (transactional) type', async () => {
    await expect(service.updatePreference('u1', { type: 'PAYMENT_CONFIRMED', inAppEnabled: false } as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it('updates only the caller preference', async () => {
    const result = await service.updatePreference('u1', { type: 'LOW_STOCK', inAppEnabled: false } as never);
    expect(prisma.notificationPreference.upsert.mock.calls[0][0].where).toEqual({
      userId_type: { userId: 'u1', type: 'LOW_STOCK' },
    });
    expect(result.inAppEnabled).toBe(false);
  });

  /* -------------------------------- content -------------------------------- */

  describe('content', () => {
    it('generates title/body on the server for every type', () => {
      for (const type of [...MANDATORY_NOTIFICATION_TYPES, ...TOGGLEABLE_NOTIFICATION_TYPES]) {
        const content = buildNotificationContent(type, { orderNumber: 'ORD-1', amount: '1.00' });
        expect(content.title.length).toBeGreaterThan(2);
        expect(content.body.length).toBeGreaterThan(3);
        expect(content.data).toBeDefined();
      }
    });

    it('keeps secrets, proofs and reasons out of the notification body', () => {
      const payload = {
        orderNumber: 'ORD-1', amount: '10.00',
        // hostile extra fields must be ignored, not copied
        proofUrl: 'https://internal/secret.png', authorization: 'Bearer x', password: 'p',
        reason: 'internal note', rejectionReason: 'internal note',
      } as never;
      for (const type of ['PAYMENT_REJECTED', 'PAYMENT_SUBMITTED_FOR_REVIEW', 'ORDER_CREATED']) {
        const content = buildNotificationContent(type, payload);
        const blob = JSON.stringify(content).toLowerCase();
        for (const forbidden of ['secret.png', 'bearer', 'password', 'internal note', 'token']) {
          expect(`${type} ~ ${forbidden}:${blob.includes(forbidden)}`).toBe(`${type} ~ ${forbidden}:false`);
        }
      }
    });

    it('rejects an unknown type instead of inventing content', () => {
      expect(() => buildNotificationContent('SOMETHING_ELSE', {})).toThrow(/غير مدعوم/);
    });
  });

  it('builds deterministic, collision-free event keys', () => {
    expect(buildEventKey('ORDER_CREATED', 'order', 12)).toBe('ORDER_CREATED:order:12');
    expect(buildEventKey('LOW_STOCK', 'inventory', 3, 'mv9')).toBe('LOW_STOCK:inventory:3:mv9');
    expect(buildEventKey('ORDER_CREATED', 'order', 12)).toBe(buildEventKey('ORDER_CREATED', 'order', 12));
    expect(buildEventKey('ORDER_CREATED', 'order', 1) === buildEventKey('ORDER_CREATED', 'order', 11)).toBe(false);
  });

  it('defaults to the IN_APP provider', () => {
    delete process.env.NOTIFICATION_PROVIDER;
    expect(NOTIFICATION_PROVIDER_NAME).toBe('IN_APP');
    expect(inApp.channel).toBe('IN_APP');
  });
});
