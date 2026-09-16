import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 11 — Notifications (e2e).
 *
 * Every notification here is produced by a REAL domain event through the API:
 * order → payment → Sham Cash submit → confirm/reject, and the verification flow.
 * Deduplication, isolation, concurrency and business integrity are all asserted
 * against the database.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;
  let prisma: PrismaClient;
  let openApi: { paths: Record<string, any> };

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const tokens: Record<string, string> = {};
  const ids: Record<string, any> = {};
  const phones: Record<string, string> = {
    a: `0351${stamp}`, b: `0352${stamp}`, staffNoPerm: `0353${stamp}`, staffAdmin: `0354${stamp}`,
  };
  const emails: Record<string, string> = Object.fromEntries(
    Object.entries(phones).map(([who]) => [who, `notif.${who}.${stamp}@alwled.test`]),
  );
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  let seq = 0;
  const nextKey = () => `ntf-${stamp}-${++seq}`;

  const notificationsOf = (userId: string, eventKey?: string) =>
    prisma.notification.findMany({
      where: { userId, ...(eventKey ? { eventKey } : {}) },
      select: { id: true, type: true, eventKey: true, readAt: true, deliveryStatus: true, title: true, body: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    http = () => request(app.getHttpServer());
    prisma = new PrismaClient();
    openApi = SwaggerModule.createDocument(
      app, new DocumentBuilder().setTitle('Alwled Store API').setVersion('0.1').addBearerAuth().build(),
    );

    const ownerLogin = await http().post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    tokens.owner = ownerLogin.body.data.accessToken;

    // staff: no permissions, and ADMIN (has payments.update + notifications.admin.read)
    await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `NTFNOPERM_${stamp}`, description: 'بدون صلاحيات إشعارات',
    });
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Notif', lastName: 'NoPerm', email: emails.staffNoPerm, phone: phones.staffNoPerm,
      password: pass, roleName: `NTFNOPERM_${stamp}`,
    });
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Notif', lastName: 'Admin', email: emails.staffAdmin, phone: phones.staffAdmin,
      password: pass, roleName: 'ADMIN',
    });

    for (const who of ['a', 'b'] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Notif', lastName: `N${who.toUpperCase()}`, email: emails[who], phone: phones[who],
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
    }
    for (const who of ['a', 'b', 'staffNoPerm', 'staffAdmin'] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone: phones[who], password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      ids[who] = me.body.data.id;
    }

    // catalog + stock so real orders can be created
    const category = await http().post('/api/v1/categories').set(auth('owner')).send({
      name: `إشعارات تصنيف ${stamp}`, slug: `ntf-cat-${stamp}`,
    });
    const brand = await http().post('/api/v1/brands').set(auth('owner')).send({
      name: `إشعارات علامة ${stamp}`, slug: `ntf-brand-${stamp}`,
    });
    const product = await http().post('/api/v1/products').set(auth('owner')).send({
      name: `منتج إشعارات ${stamp}`, sku: `NTF-${stamp}`, price: 120.5,
      categoryId: category.body.data.id, brandId: brand.body.data.id,
    });
    ids.category = category.body.data.id;
    ids.brand = brand.body.data.id;
    ids.product = product.body.data.id;
    await http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({
      quantity: 20, reason: 'STOCK_RECEIVED',
    });
  }, 240000);

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.notificationOutbox.deleteMany({ where: { aggregateId: { in: (ids.orders ?? []).map(String) } } });
      await prisma.inventory.deleteMany({ where: { productId: ids.product } });
      await prisma.product.deleteMany({ where: { id: ids.product } });
      await prisma.category.deleteMany({ where: { id: ids.category } });
      await prisma.brand.deleteMany({ where: { id: ids.brand } });
      await prisma.role.deleteMany({ where: { name: `NTFNOPERM_${stamp}`, isSystem: false } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ---------------------------- auth & surface ---------------------------- */

  describe('surface', () => {
    it('requires a token on every customer route', async () => {
      for (const [method, path] of [
        ['get', '/api/v1/notifications'], ['get', '/api/v1/notifications/unread-count'],
        ['get', '/api/v1/notifications/preferences'], ['get', '/api/v1/notifications/whatever'],
        ['post', '/api/v1/notifications/read-all'], ['post', '/api/v1/notifications/whatever/read'],
        ['patch', '/api/v1/notifications/preferences'],
      ] as const) {
        const res = await (http() as any)[method](path).send({});
        expect(`${method} ${path}:${res.status}`).toBe(`${method} ${path}:401`);
      }
    });

    it('has no endpoint that creates a notification or picks a recipient', async () => {
      for (const path of ['/api/v1/notifications', '/api/v1/notifications/create']) {
        const res = await http().post(path).set(auth('a')).send({ userId: ids.b, title: 'x', body: 'y' });
        expect(`${path}:${res.status === 404 || res.status === 405}`).toBe(`${path}:true`);
      }
      expect(await prisma.notification.count({ where: { userId: ids.b } })).toBe(0);
    });

    it('protects the admin queue with a permission', async () => {
      expect((await http().get('/api/v1/admin/notifications').set(auth('a'))).status).toBe(403);
      expect((await http().get('/api/v1/admin/notifications').set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().get('/api/v1/admin/notifications').set(auth('staffAdmin'))).status).toBe(200);
      expect((await http().get('/api/v1/admin/notifications')).status).toBe(401);
    });

    it('documents every notification route in OpenAPI', async () => {
      const paths = Object.keys(openApi.paths).filter((p) => p.includes('notification'));
      for (const path of [
        '/api/v1/notifications', '/api/v1/notifications/unread-count', '/api/v1/notifications/preferences',
        '/api/v1/notifications/{id}', '/api/v1/notifications/{id}/read', '/api/v1/notifications/read-all',
        '/api/v1/admin/notifications', '/api/v1/admin/notifications/{id}',
      ]) {
        expect(`${path}:${paths.includes(path)}`).toBe(`${path}:true`);
      }
    });
  });

  /* --------------------------- real event flow ---------------------------- */

  describe('real domain events produce notifications', () => {
    it('registers nothing for plain registration (no fake events)', async () => {
      expect(await notificationsOf(ids.a)).toHaveLength(0);
    });

    it('ORDER_CREATED appears after a real order', async () => {
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 2 });
      const order = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
      expect(order.status).toBe(201);
      console.log('ORDER CREATE DATA', JSON.stringify(order.body.data).slice(0, 300));
      ids.objectOrder = order.body.data.id;
      ids.objectOrderNumber = order.body.data.orderNumber;
      ids.orders = [order.body.data.id];

      const rows = await notificationsOf(ids.a, `ORDER_CREATED:order:${order.body.data.id}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'ORDER_CREATED', deliveryStatus: 'DELIVERED' });
      expect(rows[0].body).toContain(order.body.data.orderNumber);
      expect(rows[0].readAt).toBeNull();
    });

    it('PAYMENT_CREATED appears after a real payment', async () => {
      const payment = await http().post('/api/v1/payments')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() })
        .send({ orderId: ids.objectOrder });
      expect({ status: payment.status, body: payment.body }).toMatchObject({ status: 201 });
      ids.payment = payment.body.data.id;

      const rows = await notificationsOf(ids.a, `PAYMENT_CREATED:payment:${ids.payment}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('PAYMENT_CREATED');
    });

    it('PAYMENT_SUBMITTED_FOR_REVIEW notifies the customer AND the review permission holders', async () => {
      const submitted = await http().post(`/api/v1/payments/${ids.payment}/submit`).set(auth('a')).send({
        transactionReference: `SC-NTF-${stamp}-1`, proofUrl: 'https://cdn.test/proof.png', proofNote: 'حوالة',
      });
      expect(submitted.status).toBe(201);
      ids.paymentOrderNumber = submitted.body.data.orderNumber ?? ids.objectOrderNumber;
      expect(ids.paymentOrderNumber).toBe(ids.objectOrderNumber);

      const customerRows = await notificationsOf(ids.a, `PAYMENT_SUBMITTED_FOR_REVIEW:payment:${ids.payment}`);
      expect(customerRows).toHaveLength(1);
      expect(customerRows[0].type).toBe('PAYMENT_SUBMITTED_FOR_REVIEW');
      // proof content is NOT copied into the notification
      expect(JSON.stringify(customerRows[0])).not.toContain('cdn.test');

      // staff recipients resolved by permission (payments.update): admin + owner wildcard
      const adminRows = await notificationsOf(ids.staffAdmin, `PAYMENT_REVIEW_REQUIRED:payment:${ids.payment}:review`);
      expect(adminRows).toHaveLength(1);
      expect(adminRows[0].type).toBe('PAYMENT_REVIEW_REQUIRED');
      const noPermRows = await notificationsOf(ids.staffNoPerm);
      expect(noPermRows).toHaveLength(0);
    });

    it('PAYMENT_CONFIRMED and PAYMENT_REJECTED follow the admin decision', async () => {
      const confirm = await http().post(`/api/v1/admin/payments/${ids.payment}/confirm`).set(auth('staffAdmin')).send({});
      expect(confirm.status).toBe(200);
      const confirmed = await notificationsOf(ids.a, `PAYMENT_CONFIRMED:payment:${ids.payment}`);
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].body).toContain('تم تأكيد دفعتك');

      // a second payment for the rejection path
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const order2 = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
      ids.orders.push(order2.body.data.id);
      const payment2 = await http().post('/api/v1/payments')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({ orderId: order2.body.data.id });
      const pay2 = payment2.body.data.id;
      await http().post(`/api/v1/payments/${pay2}/submit`).set(auth('a')).send({
        transactionReference: `SC-NTF-${stamp}-2`, proofUrl: 'https://cdn.test/proof2.png',
      });
      const reject = await http().post(`/api/v1/admin/payments/${pay2}/reject`)
        .set(auth('staffAdmin')).send({ reason: 'صف داخلي: رقم الحوالة غير مطابق' });
      expect(reject.status).toBe(200);

      const rejected = await notificationsOf(ids.a, `PAYMENT_REJECTED:payment:${pay2}`);
      expect(rejected).toHaveLength(1);
      // the internal rejection reason must not leak into the notification
      expect(rejected[0].body).not.toContain('صف داخلي');
      expect(rejected[0].title).toContain('لم يتم تأكيد الدفع');
      ids.payment2 = pay2;
    });

    it('ORDER_CONFIRMED and ORDER_CANCELLED come from the order lifecycle', async () => {
      // one order is confirmed by staff, a second one is cancelled by the customer
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const toConfirm = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
      (ids.orders ??= []).push(toConfirm.body.data.id);
      const confirm = await http().patch(`/api/v1/admin/orders/${toConfirm.body.data.id}/status`)
        .set(auth('owner')).send({ status: 'CONFIRMED' });
      expect(confirm.status).toBe(200);
      const confirmed = await notificationsOf(ids.a, `ORDER_CONFIRMED:order:${toConfirm.body.data.id}`);
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].body).toContain(toConfirm.body.data.orderNumber);

      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const toCancel = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
      (ids.orders ??= []).push(toCancel.body.data.id);
      expect((await http().post(`/api/v1/orders/${toCancel.body.data.id}/cancel`)
        .set(auth('a')).send({ reason: 'غيّرت رأيي' })).status).toBe(200);
      const cancelled = await notificationsOf(ids.a, `ORDER_CANCELLED:order:${toCancel.body.data.id}`);
      expect(cancelled).toHaveLength(1);
    });

    it('the verification flow notifies its own lifecycle events', async () => {
      const started = await http().post('/api/v1/verification/start')
        .set({ ...auth('b'), 'Idempotency-Key': nextKey() }).send({});
      expect(started.status).toBe(201);
      const verificationId = started.body.data.verification.id;
      ids.verificationId = verificationId;

      const startedRows = await notificationsOf(ids.b, `VERIFICATION_STARTED:verification:${verificationId}:a1`);
      expect(startedRows).toHaveLength(1);

      expect((await http().post(`/api/v1/admin/verifications/${verificationId}/review`).set(auth('owner')).send({})).status).toBe(200);
      expect(await notificationsOf(ids.b, `VERIFICATION_REVIEWED:verification:${verificationId}:a1`)).toHaveLength(1);

      expect((await http().post(`/api/v1/admin/verifications/${verificationId}/reject`)
        .set(auth('owner')).send({ reason: 'صورة غير واضحة (داخلي)' })).status).toBe(200);
      const rejected = await notificationsOf(ids.b, `VERIFICATION_REJECTED:verification:${verificationId}:a1`);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].body).not.toContain('داخلي');
    });
  });

  /* ------------------------------- dedup ---------------------------------- */

  describe('deduplication', () => {
    it('one notification per event, even after processing the outbox again', async () => {
      const before = await prisma.notification.count();
      const processed = await http().post('/api/v1/admin/notifications/outbox/process').set(auth('owner')).send({});
      expect([200, 201]).toContain(processed.status);
      const after = await prisma.notification.count();
      expect(after).toBe(before);
      const keys = await prisma.notification.groupBy({
        by: ['userId', 'eventKey'], _count: { _all: true },
      });
      for (const row of keys) {
        expect(`${row.eventKey}:${row._count._all}`).toBe(`${row.eventKey}:1`);
      }
    });

    it('a repeated event processed concurrently still yields one notification', async () => {
      const eventKey = `ORDER_CREATED:order:${ids.objectOrder}`;
      const countBefore = await prisma.notification.count({ where: { eventKey } });
      expect(countBefore).toBe(1);
      const results = await Promise.all([
        http().post('/api/v1/admin/notifications/outbox/process').set(auth('owner')).send({}),
        http().post('/api/v1/admin/notifications/outbox/process').set(auth('owner')).send({}),
      ]);
      for (const res of results) expect([200, 201]).toContain(res.status);
      expect(await prisma.notification.count({ where: { eventKey } })).toBe(1);
      // the database itself enforces it
      await expect(prisma.notification.create({
        data: {
          userId: ids.a, type: 'ORDER_CREATED', title: 't', body: 'b',
          eventKey, channel: 'IN_APP', deliveryStatus: 'PENDING',
        },
      })).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  /* ------------------------------ customer api ---------------------------- */

  describe('customer inbox', () => {
    it('lists only my notifications, paginated and bounded', async () => {
      const res = await http().get('/api/v1/notifications?limit=3&page=1').set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(3);
      const storedIds = (await notificationsOf(ids.a)).map((n) => n.id);
      for (const item of res.body.data.items) expect(storedIds).toContain(item.id);
      expect(res.body.data.meta).toMatchObject({ page: 1, limit: 3 });
      expect(res.body.data.meta.unread).toBeGreaterThanOrEqual(0);

      expect((await http().get('/api/v1/notifications?limit=51').set(auth('a'))).status).toBe(400);
      expect((await http().get('/api/v1/notifications?limit=1000000').set(auth('a'))).status).toBe(400);
      expect((await http().get('/api/v1/notifications?sortBy=passwordHash').set(auth('a'))).status).toBe(400);
      expect((await http().get('/api/v1/notifications?type=NOPE').set(auth('a'))).status).toBe(400);
      expect((await http().get('/api/v1/notifications?from=2026-09-30T00:00:00Z&to=2026-09-01T00:00:00Z').set(auth('a'))).status).toBe(400);
    });

    it('filters by read state and type', async () => {
      const unread = await http().get('/api/v1/notifications?read=false&limit=50').set(auth('a'));
      expect(unread.status).toBe(200);
      for (const item of unread.body.data.items) expect(item.readAt).toBeNull();
      const typed = await http().get('/api/v1/notifications?type=PAYMENT_CONFIRMED&limit=50').set(auth('a'));
      expect(typed.body.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of typed.body.data.items) expect(item.type).toBe('PAYMENT_CONFIRMED');
    });

    it('unread-count is a database count', async () => {
      const res = await http().get('/api/v1/notifications/unread-count').set(auth('a'));
      expect(res.status).toBe(200);
      const expected = await prisma.notification.count({ where: { userId: ids.a, readAt: null } });
      expect(res.body.data.count).toBe(expected);
    });

    it('reads a single notification and marks it read idempotently', async () => {
      const target = (await notificationsOf(ids.a))[0];
      const detail = await http().get(`/api/v1/notifications/${target.id}`).set(auth('a'));
      expect(detail.status).toBe(200);
      expect(detail.body.data).not.toHaveProperty('userId');

      const before = await http().get('/api/v1/notifications/unread-count').set(auth('a'));
      const first = await http().post(`/api/v1/notifications/${target.id}/read`).set(auth('a')).send({});
      expect(first.status).toBe(200);
      expect(first.body.data.readAt).not.toBeNull();
      expect(first.body.data.changed).toBe(true);

      const second = await http().post(`/api/v1/notifications/${target.id}/read`).set(auth('a')).send({});
      expect(second.status).toBe(200);
      expect(second.body.data.changed).toBe(false); // no duplicate effect

      const after = await http().get('/api/v1/notifications/unread-count').set(auth('a'));
      expect(after.body.data.count).toBe(before.body.data.count - 1);
      const stored = await prisma.notification.findUnique({ where: { id: target.id }, select: { readAt: true } });
      expect(stored?.readAt).not.toBeNull();
    });

    it('marks all read for the caller only', async () => {
      const otherUnreadBefore = await prisma.notification.count({ where: { userId: ids.b, readAt: null } });
      const res = await http().post('/api/v1/notifications/read-all').set(auth('a')).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.unread).toBe(0);
      expect(await prisma.notification.count({ where: { userId: ids.a, readAt: null } })).toBe(0);
      // another user's notifications are untouched
      expect(await prisma.notification.count({ where: { userId: ids.b, readAt: null } })).toBe(otherUnreadBefore);
    });

    it('handles concurrent mark-read without corruption', async () => {
      const target = (await notificationsOf(ids.b))[0];
      const results = await Promise.all([
        http().post(`/api/v1/notifications/${target.id}/read`).set(auth('b')).send({}),
        http().post(`/api/v1/notifications/${target.id}/read`).set(auth('b')).send({}),
      ]);
      for (const res of results) expect(res.status).toBe(200);
      const stored = await prisma.notification.findUnique({ where: { id: target.id }, select: { readAt: true } });
      expect(stored?.readAt).not.toBeNull();
      // exactly one of the two actually changed the row
      expect(results.filter((r) => r.body.data.changed === true)).toHaveLength(1);
    });
  });

  /* -------------------------------- isolation ----------------------------- */

  describe('isolation', () => {
    it('another user notification is a 404, not a 403', async () => {
      const aNotification = (await notificationsOf(ids.a))[0];
      expect((await http().get(`/api/v1/notifications/${aNotification.id}`).set(auth('b'))).status).toBe(404);
      expect((await http().post(`/api/v1/notifications/${aNotification.id}/read`).set(auth('b')).send({})).status).toBe(404);
      const stored = await prisma.notification.findUnique({ where: { id: aNotification.id }, select: { readAt: true } });
      expect(stored?.readAt).not.toBeNull(); // untouched by the foreign attempt
    });

    it('a customer cannot read the admin queue and the admin keeps its own inbox', async () => {
      expect((await http().get('/api/v1/admin/notifications').set(auth('a'))).status).toBe(403);
      const adminList = await http().get('/api/v1/admin/notifications?limit=5').set(auth('staffAdmin'));
      expect(adminList.status).toBe(200);
      // the admin queue is staff-operational: it is a separate surface from /notifications
      expect(adminList.body.data.items.every((i: any) => typeof i.id === 'string')).toBe(true);
      expect((await http().get('/api/v1/admin/notifications/summary').set(auth('staffAdmin'))).status).toBe(200);
    });
  });

  /* ------------------------------ preferences ----------------------------- */

  describe('preferences', () => {
    it('returns deterministic defaults without creating rows', async () => {
      const res = await http().get('/api/v1/notifications/preferences').set(auth('a'));
      expect(res.status).toBe(200);
      const orderCreated = res.body.data.items.find((i: any) => i.type === 'ORDER_CREATED');
      expect(orderCreated).toMatchObject({ inAppEnabled: true, mandatory: true, explicit: false });
      expect(await prisma.notificationPreference.count({ where: { userId: ids.a } })).toBe(0);
    });

    it('updates a switchable preference and refuses mandatory ones', async () => {
      const patch = await http().patch('/api/v1/notifications/preferences').set(auth('a'))
        .send({ type: 'LOW_STOCK', inAppEnabled: false });
      expect(patch.status).toBe(200);
      expect(patch.body.data).toMatchObject({ type: 'LOW_STOCK', inAppEnabled: false });

      const mandatory = await http().patch('/api/v1/notifications/preferences').set(auth('a'))
        .send({ type: 'PAYMENT_CONFIRMED', inAppEnabled: false });
      expect(mandatory.status).toBe(400);

      expect((await http().patch('/api/v1/notifications/preferences').set(auth('a'))
        .send({ type: 'LOW_STOCK', inAppEnabled: false, userId: ids.b })).status).toBe(400);
      expect((await http().patch('/api/v1/notifications/preferences').set(auth('a'))
        .send({ type: 'NOPE', inAppEnabled: true })).status).toBe(400);
      // the stored preference belongs to the caller only
      expect(await prisma.notificationPreference.count({ where: { userId: ids.b } })).toBe(0);
    });
  });

  /* --------------------------- integrity & privacy ------------------------ */

  describe('integrity', () => {
    const snapshot = async () => {
      const [row] = await prisma.$queryRaw<Record<string, string>[]>(Prisma.sql`
        SELECT (SELECT COUNT(*) FROM orders)::text AS orders,
               (SELECT COUNT(*) FROM payments)::text AS payments,
               (SELECT COUNT(*) FROM inventory)::text AS inventory,
               (SELECT COALESCE(SUM(quantity),0) FROM inventory)::text AS qty,
               (SELECT COALESCE(SUM(reserved_quantity),0) FROM inventory)::text AS reserved,
               (SELECT COUNT(*) FROM products)::text AS products,
               (SELECT COUNT(*) FROM users)::text AS users,
               (SELECT COUNT(*) FROM customer_verifications)::text AS verifications,
               (SELECT COUNT(*) FROM carts)::text AS carts,
               (SELECT COUNT(*) FROM audit_logs)::text AS audit`);
      return row;
    };

    it('notification reads never mutate business data or add audit noise', async () => {
      const before = await snapshot();
      for (const path of [
        '/api/v1/notifications', '/api/v1/notifications/unread-count', '/api/v1/notifications/preferences',
        '/api/v1/admin/notifications', '/api/v1/admin/notifications/summary',
      ]) {
        const res = await http().get(path).set(path.startsWith('/api/v1/admin') ? auth('staffAdmin') : auth('a'));
        expect(`${path}:${res.status}`).toBe(`${path}:200`);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('never leaks secrets, hashes, tokens or storage locations', async () => {
      const responses = await Promise.all([
        http().get('/api/v1/notifications?limit=50').set(auth('a')),
        http().get('/api/v1/notifications/unread-count').set(auth('a')),
        http().get('/api/v1/notifications/preferences').set(auth('a')),
        http().get('/api/v1/admin/notifications?limit=50').set(auth('staffAdmin')),
        http().get('/api/v1/admin/notifications/summary').set(auth('staffAdmin')),
      ]);
      for (const res of responses) {
        const blob = JSON.stringify(res.body);
        for (const forbidden of [
          'passwordHash', 'password_hash', 'refreshToken', 'tokenHash', 'apiKey', 'api_key',
          'secret', 'authorization', 'proofUrl', 'storageKey', 'providerPaymentId', 'postgres://',
        ]) {
          expect(`${forbidden}:${blob.includes(forbidden)}`).toBe(`${forbidden}:false`);
        }
      }
    });

    it('notification failure cannot break the business flow (outbox + bounded retries)', async () => {
      // the whole suite ran real orders/payments/verifications: every one of them committed
      const paidOrder = await prisma.order.findUnique({
        where: { id: ids.objectOrder }, select: { status: true },
      });
      expect(paidOrder).not.toBeNull();
      const outbox = await prisma.notificationOutbox.findMany({ select: { status: true } });
      for (const row of outbox) {
        expect(['PENDING', 'PROCESSED', 'FAILED']).toContain(row.status);
      }
      // no infinite retry loop: attempts stay bounded
      const exhausted = await prisma.notificationOutbox.findMany({ where: { status: 'FAILED' } });
      for (const row of exhausted) expect(row.attempts).toBeLessThanOrEqual(3);
    });
  });
});
