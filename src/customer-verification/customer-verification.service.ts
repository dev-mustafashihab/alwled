import {
  ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { IDEMPOTENCY_SCOPES, ORDER_LIMITS } from '../common/constants';
import type { RequestMeta } from '../common/types/request-meta';
import { VerificationProviderRegistry } from './providers/verification-provider.registry';
import { ListVerificationsQueryDto, StartVerificationDto } from './dto/verification.dto';
import {
  ACTIVE_VERIFICATION_STATUSES, RETRYABLE_VERIFICATION_STATUSES, VERIFICATION_SELECT,
  VERIFICATION_SOURCE, VERIFICATION_STATUS, VerificationRow, VerificationStatusValue,
  canTransitionVerification, resolveEffectiveVerificationStatus, verificationExpiryFrom,
} from './customer-verification.constants';

export interface ActorRef {
  id: string;
  isStaff: boolean;
}

/**
 * Customer verification domain (Stage 9).
 *
 * Boundaries:
 *  - the only provider is the internal LOG provider → zero external calls;
 *  - nothing here can mark a customer VERIFIED except an employee decision, which is
 *    recorded as source=MANUAL (never as provider verification);
 *  - no inventory, order or payment behaviour is touched.
 */
@Injectable()
export class CustomerVerificationService {
  private readonly logger = new Logger('CustomerVerification');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: VerificationProviderRegistry,
  ) {}

  /* ------------------------------ serialization ---------------------------- */

  private serialize(row: VerificationRow | null) {
    if (!row) {
      // Virtual state: the user simply has not started yet.
      return {
        id: null,
        userId: null,
        status: VERIFICATION_STATUS.NOT_STARTED,
        provider: null,
        providerReference: null,
        source: null,
        attempt: 0,
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        expiresAt: null,
        rejectionReason: null,
        reviewedAt: null,
        canStart: true,
        canCancel: false,
        isVerified: false,
      };
    }

    const effective = resolveEffectiveVerificationStatus(row.status, row.expiresAt);
    return {
      id: row.id,
      userId: row.userId,
      status: effective,
      provider: row.provider,
      providerReference: row.providerReference,
      source: row.source,
      attempt: row.attempt,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      rejectionReason: row.rejectionReason,
      reviewedAt: row.reviewedAt,
      canStart: effective !== 'PENDING' && effective !== 'IN_REVIEW' && effective !== 'VERIFIED'
        && effective !== 'CANCELLED',
      canCancel: ACTIVE_VERIFICATION_STATUSES.includes(effective),
      // Only a completed verification counts — a stored row never implies success.
      isVerified: effective === VERIFICATION_STATUS.VERIFIED,
    };
  }

  /* -------------------------------- helpers -------------------------------- */

  private async latestForUser(userId: string): Promise<VerificationRow | null> {
    const row = await this.prisma.customerVerification.findFirst({
      where: { userId },
      select: VERIFICATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return (row as unknown as VerificationRow) ?? null;
  }

  /**
   * Lazy expiry: an ACTIVE row past expiresAt becomes EXPIRED (with a valid
   * transition, completedAt and audit). Called on read and before starting.
   */
  private async applyLazyExpiry(row: VerificationRow | null, meta: RequestMeta = {}): Promise<VerificationRow | null> {
    if (!row) return null;
    const effective = resolveEffectiveVerificationStatus(row.status, row.expiresAt);
    if (effective === row.status) return row;
    if (!canTransitionVerification(row.status, effective)) return row;

    const updated = await this.prisma.customerVerification.update({
      where: { id: row.id },
      data: { status: effective, completedAt: new Date() },
      select: VERIFICATION_SELECT,
    });

    await this.audit.log({
      action: AUDIT.VERIFICATION_EXPIRED,
      actorId: null,
      entity: 'verification',
      entityId: row.id,
      metadata: {
        verificationId: row.id,
        userId: row.userId,
        status: effective,
        source: VERIFICATION_SOURCE.SYSTEM,
        provider: row.provider,
        attempt: row.attempt,
      },
      ...meta,
    });

    return updated as unknown as VerificationRow;
  }

  /* --------------------------------- reads --------------------------------- */

  /** GET /verification/me — the caller's own state (virtual NOT_STARTED when none). */
  async getMine(userId: string, meta: RequestMeta = {}) {
    const row = await this.latestForUser(userId);
    const normalized = await this.applyLazyExpiry(row, meta);
    return { ...this.serialize(normalized), providerConfigured: this.providers.name, externalProvider: this.providers.isExternal };
  }

  async adminList(query: ListVerificationsQueryDto) {
    const { page, limit, status, userId, sortBy, sortOrder } = query;
    const where: Prisma.CustomerVerificationWhereInput = {
      ...(status ? { status: status as VerificationStatusValue } : {}),
      ...(userId ? { userId } : {}),
    };
    const orderField = ['createdAt', 'updatedAt', 'status'].includes(sortBy) ? sortBy : 'createdAt';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerVerification.count({ where }),
      this.prisma.customerVerification.findMany({
        where,
        select: VERIFICATION_SELECT,
        orderBy: [{ [orderField]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.serialize(r as unknown as VerificationRow)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async adminFindOne(id: string) {
    const row = await this.prisma.customerVerification.findUnique({
      where: { id },
      select: { ...VERIFICATION_SELECT, reviewer: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!row) throw new NotFoundException('طلب التحقق غير موجود');
    return this.serialize(row as unknown as VerificationRow);
  }

  /** A customer may read only their own record; anyone else's looks nonexistent. */
  async findOneForCustomer(id: string, userId: string) {
    const row = await this.prisma.customerVerification.findFirst({
      where: { id, userId },
      select: VERIFICATION_SELECT,
    });
    if (!row) throw new NotFoundException('طلب التحقق غير موجود');
    return this.serialize(await this.applyLazyExpiry(row as unknown as VerificationRow));
  }

  /* ------------------------------- mutations -------------------------------- */

  /**
   * POST /verification/start — idempotent per (user, key).
   * Creates the first request, or retries after REJECTED/EXPIRED (the same record
   * moves back to PENDING, which the DB enforces as a single active row per user).
   */
  async start(
    userId: string,
    idempotencyKey: string,
    dto: StartVerificationDto,
    meta: RequestMeta = {},
  ): Promise<{ verification: Record<string, unknown>; replayed: boolean }> {
    const key = (idempotencyKey ?? '').trim();
    if (!key) throw new ConflictException('ترويسة Idempotency-Key مطلوبة');
    if (key.length > ORDER_LIMITS().idempotencyKeyMaxLength) {
      throw new ConflictException('Idempotency-Key طويل جداً');
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify({ action: 'verification.start', locale: dto.locale ?? null }))
      .digest('hex');

    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.VERIFICATION, key } },
      select: { requestHash: true, verificationId: true },
    });
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key مستخدم مسبقاً بطلب مختلف');
      }
      if (existingKey.verificationId) {
        const row = await this.prisma.customerVerification.findUnique({
          where: { id: existingKey.verificationId }, select: VERIFICATION_SELECT,
        });
        if (row) return { verification: this.serialize(row as unknown as VerificationRow), replayed: true };
      }
      throw new ConflictException('الطلب قيد المعالجة — أعد المحاولة بعد لحظات');
    }

    // Normalise an expired active row first so start() sees the real status.
    let current = await this.latestForUser(userId);
    current = await this.applyLazyExpiry(current, meta);

    const attempt = (current?.attempt ?? 0) + 1;
    let created: VerificationRow;
    let restarted = false;

    try {
    if (!current) {
      created = await this.prisma.customerVerification.create({
        data: {
          userId,
          status: VERIFICATION_STATUS.PENDING,
          provider: this.providers.name,
          source: VERIFICATION_SOURCE.SYSTEM,
          attempt: 1,
          startedAt: new Date(),
          submittedAt: new Date(),
          expiresAt: verificationExpiryFrom(),
        },
        select: VERIFICATION_SELECT,
      }) as unknown as VerificationRow;
    } else if (ACTIVE_VERIFICATION_STATUSES.includes(current.status)) {
      throw new ConflictException('لديك طلب تحقق قيد المعالجة بالفعل');
    } else if (RETRYABLE_VERIFICATION_STATUSES.includes(current.status)) {
      restarted = true;
      created = await this.prisma.customerVerification.update({
        where: { id: current.id },
        data: {
          status: VERIFICATION_STATUS.PENDING,
          provider: this.providers.name,
          source: VERIFICATION_SOURCE.SYSTEM,
          attempt,
          startedAt: new Date(),
          submittedAt: new Date(),
          expiresAt: verificationExpiryFrom(),
          completedAt: null,
          rejectionReason: null,
          reviewedAt: null,
          reviewedBy: null,
        },
        select: VERIFICATION_SELECT,
      }) as unknown as VerificationRow;
    } else if (current.status === VERIFICATION_STATUS.VERIFIED) {
      throw new ConflictException('حسابك موثَّق بالفعل');
    } else {
      // CANCELLED is terminal: the state machine has no CANCELLED → PENDING.
      throw new ConflictException('الطلب ملغى — الطلب الملغى نهائي ولا يمكن إعادة بدء التحقق');
    }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Partial unique index: one active verification per user, enforced by Postgres.
        // A concurrent start lost the race — no second active row can exist.
        throw new ConflictException('لديك طلب تحقق قيد المعالجة بالفعل');
      }
      throw error;
    }

    // Provider handoff (LOG provider only: no network, returns PENDING).
    let providerReference: string | null = null;
    try {
      const result = await this.providers.provider.startVerification({
        verificationId: created.id, userId, attempt, locale: dto.locale,
      });
      providerReference = result.providerReference;
      if (result.providerReference) {
        created = (await this.prisma.customerVerification.update({
          where: { id: created.id },
          data: { providerReference: result.providerReference },
          select: VERIFICATION_SELECT,
        })) as unknown as VerificationRow;
      }
      // Safety net: a provider may never push a customer straight to VERIFIED here.
      if (result.status === VERIFICATION_STATUS.VERIFIED) {
        this.logger.warn(
          `provider ${this.providers.name} reported VERIFIED for ${created.id}; ignored (manual review required)`,
        );
      }
    } catch (error) {
      this.logger.warn(`provider start failed for ${created.id}: ${(error as Error).message}`);
      // The request stays PENDING for the internal queue — no rollback of the record.
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          userId,
          key,
          requestHash,
          scope: IDEMPOTENCY_SCOPES.VERIFICATION,
          verificationId: created.id,
          statusCode: 201,
        },
      });
    } catch (error) {
      // Lost the idempotency race: the winner's record is already the active one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.idempotencyKey.findUnique({
          where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.VERIFICATION, key } },
          select: { requestHash: true, verificationId: true },
        });
        if (winner?.verificationId && winner.requestHash === requestHash) {
          const row = await this.prisma.customerVerification.findUnique({
            where: { id: winner.verificationId }, select: VERIFICATION_SELECT,
          });
          if (row) return { verification: this.serialize(row as unknown as VerificationRow), replayed: true };
        }
      }
      throw error;
    }

    const metadata = {
      verificationId: created.id,
      userId,
      status: created.status,
      source: VERIFICATION_SOURCE.SYSTEM,
      provider: created.provider,
      providerReference,
      attempt: created.attempt,
      restarted,
    };
    await this.audit.log({
      action: AUDIT.VERIFICATION_STARTED,
      actorId: userId, entity: 'verification', entityId: created.id, metadata, ...meta,
    });
    await this.audit.log({
      action: AUDIT.VERIFICATION_SUBMITTED,
      actorId: userId, entity: 'verification', entityId: created.id,
      metadata: { ...metadata, queue: 'IN_REVIEW' }, ...meta,
    });

    return { verification: this.serialize(created), replayed: false };
  }

  /** POST /verification/cancel — active → CANCELLED (terminal). */
  async cancel(userId: string, meta: RequestMeta = {}) {
    const row = await this.applyLazyExpiry(await this.latestForUser(userId), meta);
    if (!row) throw new NotFoundException('لا يوجد طلب تحقق');
    if (!ACTIVE_VERIFICATION_STATUSES.includes(row.status)) {
      throw new ConflictException(`لا يمكن إلغاء طلب بحالة ${row.status}`);
    }

    const cancelled = await this.prisma.customerVerification.update({
      where: { id: row.id },
      data: {
        status: VERIFICATION_STATUS.CANCELLED,
        completedAt: new Date(),
        source: VERIFICATION_SOURCE.SYSTEM,
      },
      select: VERIFICATION_SELECT,
    });

    if (row.providerReference) {
      try {
        await this.providers.provider.cancelVerification(row.providerReference);
      } catch (error) {
        this.logger.warn(`provider cancel failed for ${row.id}: ${(error as Error).message}`);
      }
    }

    await this.audit.log({
      action: AUDIT.VERIFICATION_CANCELLED,
      actorId: userId,
      entity: 'verification',
      entityId: row.id,
      metadata: {
        verificationId: row.id, userId, status: VERIFICATION_STATUS.CANCELLED,
        source: VERIFICATION_SOURCE.SYSTEM, provider: row.provider, attempt: row.attempt,
      },
      ...meta,
    });

    return this.serialize(cancelled as unknown as VerificationRow);
  }

  /* ----------------------------- admin workflow ----------------------------- */

  /** PENDING → IN_REVIEW (employee picks up the request). */
  async review(id: string, actor: ActorRef, meta: RequestMeta = {}) {
    const row = await this.requireForAdmin(id);
    if (!canTransitionVerification(row.status, 'IN_REVIEW')) {
      throw new ConflictException(`لا يمكن بدء المراجعة من الحالة ${row.status}`);
    }

    const updated = await this.prisma.customerVerification.update({
      where: { id },
      data: { status: 'IN_REVIEW', reviewedAt: new Date(), reviewedBy: actor.id },
      select: VERIFICATION_SELECT,
    });

    await this.audit.log({
      action: AUDIT.VERIFICATION_REVIEWED,
      actorId: actor.id,
      entity: 'verification',
      entityId: id,
      metadata: {
        verificationId: id, userId: row.userId, status: 'IN_REVIEW',
        from: row.status, source: VERIFICATION_SOURCE.MANUAL,
        provider: row.provider, attempt: row.attempt,
      },
      ...meta,
    });

    return this.serialize(updated as unknown as VerificationRow);
  }

  /**
   * IN_REVIEW → VERIFIED. Recorded as MANUAL: a human decided, and the audit says so.
   * This is the only path to VERIFIED in Stage 9 (no provider verification exists).
   */
  async verify(id: string, actor: ActorRef, meta: RequestMeta = {}) {
    const row = await this.requireForAdmin(id);
    if (!canTransitionVerification(row.status, 'VERIFIED')) {
      throw new ConflictException(`لا يمكن تأكيد طلب بحالة ${row.status}`);
    }

    const updated = await this.prisma.customerVerification.update({
      where: { id },
      data: {
        status: VERIFICATION_STATUS.VERIFIED,
        source: VERIFICATION_SOURCE.MANUAL,
        completedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: actor.id,
        rejectionReason: null,
      },
      select: VERIFICATION_SELECT,
    });

    await this.audit.log({
      action: AUDIT.VERIFICATION_VERIFIED,
      actorId: actor.id,
      entity: 'verification',
      entityId: id,
      metadata: {
        verificationId: id, userId: row.userId, status: VERIFICATION_STATUS.VERIFIED,
        source: VERIFICATION_SOURCE.MANUAL, provider: row.provider, attempt: row.attempt,
      },
      ...meta,
    });

    return this.serialize(updated as unknown as VerificationRow);
  }

  /** IN_REVIEW → REJECTED with a mandatory reason (customer may retry afterwards). */
  async reject(id: string, actor: ActorRef, reason: string, meta: RequestMeta = {}) {
    const row = await this.requireForAdmin(id);
    if (!canTransitionVerification(row.status, 'REJECTED')) {
      throw new ConflictException(`لا يمكن رفض طلب بحالة ${row.status}`);
    }

    const updated = await this.prisma.customerVerification.update({
      where: { id },
      data: {
        status: VERIFICATION_STATUS.REJECTED,
        source: VERIFICATION_SOURCE.MANUAL,
        completedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: actor.id,
        rejectionReason: reason,
      },
      select: VERIFICATION_SELECT,
    });

    await this.audit.log({
      action: AUDIT.VERIFICATION_REJECTED,
      actorId: actor.id,
      entity: 'verification',
      entityId: id,
      metadata: {
        verificationId: id, userId: row.userId, status: VERIFICATION_STATUS.REJECTED,
        source: VERIFICATION_SOURCE.MANUAL, reason, provider: row.provider, attempt: row.attempt,
      },
      ...meta,
    });

    return this.serialize(updated as unknown as VerificationRow);
  }

  private async requireForAdmin(id: string): Promise<VerificationRow> {
    const row = await this.applyLazyExpiry(
      (await this.prisma.customerVerification.findUnique({
        where: { id }, select: VERIFICATION_SELECT,
      })) as unknown as VerificationRow,
    );
    if (!row) throw new NotFoundException('طلب التحقق غير موجود');
    return row;
  }
}
