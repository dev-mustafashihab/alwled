import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationProviderRegistry } from './providers/notification-provider.registry';
import { buildNotificationContent, NotificationPayload } from './notification-content';
import {
  DEFAULT_IN_APP_ENABLED, MANDATORY_NOTIFICATION_TYPES, NOTIFICATION_LIMITS,
  NOTIFICATION_SELECT, NOTIFICATION_TYPE, NotificationRow, NotificationTypeValue,
  TOGGLEABLE_NOTIFICATION_TYPES, buildEventKey,
} from './notifications.constants';
import {
  ListNotificationsQueryDto, ListPreferencesQueryDto, UpdatePreferenceDto,
} from './dto/notifications.dto';

export interface EnqueueEventInput {
  type: NotificationTypeValue;
  aggregateType: string;
  aggregateId: string | number;
  payload: NotificationPayload;
  /** customer events target exactly this user */
  recipientUserId?: string;
  /** staff events target everyone holding this permission */
  permissionKey?: string;
  /** extra dedup discriminator (e.g. the inventory movement that crossed a threshold) */
  discriminator?: string | number;
}

/**
 * Notifications domain (Stage 11) — in-app only.
 *
 * Reliability model:
 *  1. `enqueue(tx, ...)` writes an outbox row INSIDE the business transaction, so a
 *     committed business change can never silently lose its notification;
 *  2. `dispatch()` runs in-process right after commit: it creates the notification,
 *     hands it to the IN_APP provider and marks the outbox row processed;
 *  3. a notification failure NEVER throws back into the business call and never
 *     rolls anything back — the outbox row is retried up to maxAttempts, then FAILED.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  /* ----------------------------- serialization ----------------------------- */

  private serialize(row: NotificationRow) {
    return {
      id: row.id,
      type: row.type,
      channel: row.channel,
      deliveryStatus: row.deliveryStatus,
      title: row.title,
      body: row.body,
      data: row.data ?? null,
      read: row.readAt !== null,
      readAt: row.readAt,
      deliveredAt: row.deliveredAt,
      createdAt: row.createdAt,
    };
  }

  /* ------------------------------- generation ------------------------------ */

  /**
   * Idempotent enqueue: the outbox unique key (eventType, aggregateType, aggregateId)
   * makes a repeated event a no-op instead of a duplicate notification.
   * Runs inside the caller's transaction — no business write can lose it.
   */
  async enqueue(tx: Prisma.TransactionClient, input: EnqueueEventInput): Promise<void> {
    const eventKey = buildEventKey(input.type, input.aggregateType, input.aggregateId, input.discriminator);
    if (!input.recipientUserId && !input.permissionKey) {
      throw new BadRequestException('حدث إشعار بلا مستلم محدَّد');
    }
    await tx.notificationOutbox.upsert({
      where: {
        eventType_aggregateType_aggregateId: {
          eventType: input.type,
          aggregateType: input.aggregateType,
          aggregateId: String(input.aggregateId),
        },
      },
      update: {}, // the event already exists — never enqueue it twice
      create: {
        eventType: input.type,
        aggregateType: input.aggregateType,
        aggregateId: String(input.aggregateId),
        recipientUserId: input.recipientUserId ?? null,
        permissionKey: input.permissionKey ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        eventKey,
      },
    });
  }

  /**
   * Processes pending outbox rows in a bounded batch.
   * Never throws: the caller already committed its business change.
   */
  async dispatch(limit: number = NOTIFICATION_LIMITS.outboxBatch): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    try {
      const rows = await this.prisma.notificationOutbox.findMany({
        where: {
          status: 'PENDING',
          availableAt: { lte: new Date() },
          attempts: { lt: NOTIFICATION_LIMITS.maxAttempts },
        },
        orderBy: { createdAt: 'asc' },
        take: Math.min(limit, NOTIFICATION_LIMITS.outboxBatch),
      });

      for (const row of rows) {
        try {
          await this.deliverOutboxRow(row);
          processed += 1;
        } catch (error) {
          failed += 1;
          const attempts = row.attempts + 1;
          const giveUp = attempts >= NOTIFICATION_LIMITS.maxAttempts;
          await this.prisma.notificationOutbox.update({
            where: { id: row.id },
            data: {
              attempts,
              status: giveUp ? 'FAILED' : 'PENDING',
              processedAt: giveUp ? new Date() : null,
              // safe message only — no SQL/provider internals
              lastError: giveUp ? 'تعذّر تجهيز الإشعار بعد عدة محاولات' : null,
              availableAt: new Date(Date.now() + attempts * 1_000),
            },
          });
          this.logger.warn(`outbox ${row.id} attempt ${attempts} failed: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`dispatch pass failed: ${(error as Error).message}`);
    }
    return { processed, failed };
  }

  private async deliverOutboxRow(row: {
    id: string; eventKey: string; eventType: string; payload: Prisma.JsonValue;
    recipientUserId: string | null; permissionKey: string | null;
  }): Promise<void> {
    const payload = (row.payload ?? {}) as NotificationPayload;
    const content = buildNotificationContent(row.eventType, payload);

    const recipients = row.recipientUserId
      ? [row.recipientUserId]
      : await this.recipientsByPermission(row.permissionKey as string);

    // Two batched lookups instead of two-per-recipient: the fan-out can reach every
    // staff member, and a per-recipient round trip made this an N+1 query.
    const [alreadyDelivered, disabledPreferences] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: { in: recipients }, eventKey: row.eventKey },
        select: { userId: true },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId: { in: recipients }, type: row.eventType as never, inAppEnabled: false },
        select: { userId: true },
      }),
    ]);
    const deliveredTo = new Set(alreadyDelivered.map((n) => n.userId));
    const disabledFor = new Set(disabledPreferences.map((p) => p.userId));
    const mandatory = MANDATORY_NOTIFICATION_TYPES.includes(row.eventType);

    for (const userId of recipients) {
      if (deliveredTo.has(userId)) continue; // deduplicated — same event, same user, one notification
      // preference policy: missing row = default enabled; mandatory types cannot be disabled
      const enabled = mandatory ? true : !disabledFor.has(userId);
      if (!enabled) continue;

      let notificationId: string;
      try {
        const created = await this.prisma.notification.create({
          data: {
            userId,
            type: row.eventType as never,
            channel: this.providers.provider.channel as never,
            deliveryStatus: 'PENDING',
            title: content.title,
            body: content.body,
            data: content.data as Prisma.InputJsonValue,
            eventKey: row.eventKey,
            provider: this.providers.name,
          },
          select: { id: true },
        });
        notificationId = created.id;
      } catch (error) {
        // concurrent duplicate: the database unique key won, nothing else to do
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }

      const result = await this.providers.provider.deliver({
        notificationId,
        userId,
        type: row.eventType,
        channel: this.providers.provider.channel,
        title: content.title,
        body: content.body,
      });

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: result.delivered
          ? { deliveryStatus: 'DELIVERED', deliveredAt: new Date(), provider: this.providers.name }
          : {
              deliveryStatus: 'FAILED',
              failedAt: new Date(),
              failureReason: result.failureReason ?? 'تعذّر التسليم',
              provider: this.providers.name,
            },
      });
    }

    await this.prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 0 } },
    });
  }

  /** Staff recipients are resolved by permission — never by role name. */
  private async recipientsByPermission(permissionKey: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  // an explicit permission key, or the internal wildcard (owner)
                  permission: { key: { in: [permissionKey, '*'] } },
                },
              },
            },
          },
        },
      },
      select: { id: true },
      take: NOTIFICATION_LIMITS.maxLimit * 10,
    });
    return rows.map((r) => r.id);
  }

  /**
   * Fire-and-forget dispatch used right after a business commit.
   * It can never throw into the business path.
   */
  async dispatchSafely(): Promise<void> {
    try {
      await this.dispatch();
    } catch (error) {
      this.logger.warn(`post-commit dispatch skipped: ${(error as Error).message}`);
    }
  }

  /* --------------------------------- inbox --------------------------------- */

  async listMine(userId: string, query: ListNotificationsQueryDto) {
    if (query.from && query.to && new Date(query.from).getTime() >= new Date(query.to).getTime()) {
      throw new BadRequestException('from يجب أن يكون أصغر من to (المدى فاضي)');
    }
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? NOTIFICATION_LIMITS.defaultLimit, NOTIFICATION_LIMITS.maxLimit);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.channel ? { channel: query.channel as never } : {}),
      ...(query.read === undefined ? {} : query.read ? { readAt: { not: null } } : { readAt: null }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, unread, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: query.sortOrder ?? 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
    ]);

    return {
      items: rows.map((row) => this.serialize(row as unknown as NotificationRow)),
      meta: {
        page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
        unread, sortBy: 'createdAt', sortOrder: query.sortOrder ?? 'desc',
      },
    };
  }

  async findMine(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: NOTIFICATION_SELECT,
    });
    if (!row) throw new NotFoundException('الإشعار غير موجود');
    return this.serialize(row as unknown as NotificationRow);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  /** Idempotent: marking an already-read notification again changes nothing. */
  async markRead(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('الإشعار غير موجود');

    // Conditional update: only a row that is still unread is written, so two
    // concurrent requests can never both report a change (no duplicate effect).
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const current = await this.prisma.notification.findUnique({
      where: { id }, select: NOTIFICATION_SELECT,
    });
    return { ...this.serialize(current as unknown as NotificationRow), changed: result.count === 1 };
  }

  /** Scoped bulk update: only the caller's own unread rows. */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { updated: result.count, unread };
  }

  /* ------------------------------ preferences ------------------------------ */

  async listPreferences(userId: string, query: ListPreferencesQueryDto) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId, ...(query.type ? { type: query.type as never } : {}) },
      select: { type: true, inAppEnabled: true, updatedAt: true },
      orderBy: { type: 'asc' },
    });
    const stored = new Map(rows.map((r) => [r.type as string, r]));

    // deterministic defaults: mandatory types are always on, others default enabled
    const types = query.type
      ? [query.type as string]
      : [...MANDATORY_NOTIFICATION_TYPES, ...TOGGLEABLE_NOTIFICATION_TYPES];
    return {
      items: types.map((type) => ({
        type,
        inAppEnabled: MANDATORY_NOTIFICATION_TYPES.includes(type)
          ? true
          : (stored.get(type)?.inAppEnabled ?? DEFAULT_IN_APP_ENABLED),
        mandatory: MANDATORY_NOTIFICATION_TYPES.includes(type),
        explicit: stored.has(type),
        updatedAt: stored.get(type)?.updatedAt ?? null,
      })),
    };
  }

  /** Own preferences only — the user id always comes from the token. */
  async updatePreference(userId: string, dto: UpdatePreferenceDto) {
    if (MANDATORY_NOTIFICATION_TYPES.includes(dto.type)) {
      throw new BadRequestException(
        'هذا النوع إشعار معاملاتي إلزامي ولا يمكن تعطيله (سياسة المشروع)',
      );
    }
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: dto.type as never } },
      update: { inAppEnabled: dto.inAppEnabled },
      create: { userId, type: dto.type as never, inAppEnabled: dto.inAppEnabled },
      select: { type: true, inAppEnabled: true, updatedAt: true },
    });
    return { ...row, mandatory: false, explicit: true };
  }

  /* --------------------------------- admin --------------------------------- */

  /** Staff queue. `permissionKey` narrows it (e.g. operational alerts only). */
  async adminList(query: ListNotificationsQueryDto, userId?: string) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? NOTIFICATION_LIMITS.defaultLimit, NOTIFICATION_LIMITS.maxLimit);
    const where: Prisma.NotificationWhereInput = {
      ...(userId ? { userId } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.read === undefined ? {} : query.read ? { readAt: { not: null } } : { readAt: null }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: query.sortOrder ?? 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: NOTIFICATION_SELECT,
      }),
    ]);
    return {
      items: rows.map((row) => this.serialize(row as unknown as NotificationRow)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async adminFindOne(id: string) {
    const row = await this.prisma.notification.findUnique({
      where: { id }, select: NOTIFICATION_SELECT,
    });
    if (!row) throw new NotFoundException('الإشعار غير موجود');
    return this.serialize(row as unknown as NotificationRow);
  }

  /** Operational counts for the admin queue (database counts, not loaded rows). */
  async adminSummary() {
    const [total, unread, byType] = await Promise.all([
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { readAt: null } }),
      this.prisma.notification.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);
    return {
      total,
      unread,
      byType: (byType as Array<{ type: string; _count: { _all: number } }>)
        .map((r) => ({ type: r.type, count: r._count._all }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    };
  }

  /** Manual outbox processing (admin/future worker) — bounded and safe. */
  async processOutbox(limit?: number) {
    const outcome = await this.dispatch(limit);
    const pending = await this.prisma.notificationOutbox.count({ where: { status: 'PENDING' } });
    const failed = await this.prisma.notificationOutbox.count({ where: { status: 'FAILED' } });
    return { ...outcome, pending, failed };
  }

  /** Exposed for diagnostics/tests: which provider is active. */
  get providerName(): string {
    return this.providers.name;
  }

  get externalProvider(): boolean {
    return this.providers.isExternal;
  }
}

export const NOTIFICATION_TYPES_FOR_DTO = [
  NOTIFICATION_TYPE.ORDER_CREATED, NOTIFICATION_TYPE.ORDER_CONFIRMED, NOTIFICATION_TYPE.ORDER_CANCELLED,
  NOTIFICATION_TYPE.PAYMENT_CREATED, NOTIFICATION_TYPE.PAYMENT_SUBMITTED_FOR_REVIEW,
  NOTIFICATION_TYPE.PAYMENT_CONFIRMED, NOTIFICATION_TYPE.PAYMENT_REJECTED,
  NOTIFICATION_TYPE.VERIFICATION_STARTED, NOTIFICATION_TYPE.VERIFICATION_REVIEWED,
  NOTIFICATION_TYPE.VERIFICATION_VERIFIED, NOTIFICATION_TYPE.VERIFICATION_REJECTED,
  NOTIFICATION_TYPE.LOW_STOCK, NOTIFICATION_TYPE.OUT_OF_STOCK,
  NOTIFICATION_TYPE.PAYMENT_REVIEW_REQUIRED,
];
