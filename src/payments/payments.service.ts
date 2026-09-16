import {
  ConflictException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { IDEMPOTENCY_SCOPES, ORDER_LIMITS } from '../common/constants';
import { toMoneyString } from '../common/utils/money.util';
import type { RequestMeta } from '../common/types/request-meta';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto';
import { AdminListPaymentsQueryDto } from './dto/admin-list-payments.query.dto';
import {
  ADMIN_CANCELLABLE_PAYMENT_STATUSES, CUSTOMER_SUBMITTABLE_PAYMENT_STATUSES, DEFAULT_PAYMENT_METHOD,
  PAYABLE_ORDER_STATUSES, PAYMENT_SELECT, PAYMENT_STATUS, PaymentRow, PaymentStatusValue,
  REVIEWABLE_PAYMENT_STATUSES, canTransitionPayment, shamCashAccountConfig,
} from './payments.constants';
import { STORAGE_PROVIDER, StorageProvider } from '../common/storage/storage.interface';
import { SubmitPaymentProofDto } from './dto/submit-payment-proof.dto';

export interface ActorRef {
  id: string;
  isStaff: boolean;
}

/**
 * Payment domain — provider independent.
 *
 * Invariants enforced here:
 *  - amount / currency / user are read from the Order (never from the client);
 *  - a payment never touches inventory, cart or order snapshots;
 *  - creation starts at PENDING and no HTTP path can mark a payment SUCCEEDED
 *    (only a verified provider result will be able to, in a later stage);
 *  - exactly one Payment row per Order (DB unique constraint + 409 on conflict).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /* ------------------------------ serializers ----------------------------- */

  /** Safe projection only — no hashes, tokens or provider payloads. */
  private serialize(payment: PaymentRow | Record<string, unknown>) {
    const row = payment as PaymentRow;
    return {
      id: row.id,
      orderId: row.orderId,
      userId: row.userId,
      method: row.method,
      status: row.status,
      amount: toMoneyString(row.amount),
      currency: row.currency,
      provider: row.provider,
      providerPaymentId: row.providerPaymentId,
      transactionReference: row.transactionReference ?? null,
      proofUrl: row.proofUrl ?? null,
      proofNote: row.proofNote ?? null,
      submittedAt: row.submittedAt ?? null,
      reviewedAt: row.reviewedAt ?? null,
      rejectionReason: row.rejectionReason ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      awaitsReview: row.status === PAYMENT_STATUS.PENDING_REVIEW,
    };
  }

  /* ------------------------------- creation ------------------------------- */

  /**
   * POST /payments — creates a PENDING payment for one of the caller's orders.
   * Idempotent per (user, key): a repeated submit returns the original payment.
   */
  async create(
    userId: string,
    idempotencyKey: string,
    dto: CreatePaymentDto,
    meta: RequestMeta = {},
  ): Promise<{ payment: Record<string, unknown>; replayed: boolean }> {
    const key = (idempotencyKey ?? '').trim();
    if (!key) throw new ConflictException('ترويسة Idempotency-Key مطلوبة');
    if (key.length > ORDER_LIMITS().idempotencyKeyMaxLength) {
      throw new ConflictException('Idempotency-Key طويل جداً');
    }

    // The canonical request identity is the accepted order only — never the amount.
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ orderId: dto.orderId }))
      .digest('hex');

    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.PAYMENT, key } },
      select: { requestHash: true, paymentId: true },
    });
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key مستخدم مسبقاً بطلب مختلف');
      }
      if (existingKey.paymentId) {
        const payment = await this.prisma.payment.findUnique({
          where: { id: existingKey.paymentId },
          select: PAYMENT_SELECT,
        });
        if (payment) return { payment: this.serialize(payment as unknown as PaymentRow), replayed: true };
      }
      throw new ConflictException('الدفعة قيد المعالجة — أعد المحاولة بعد لحظات');
    }

    // Ownership first: another customer's order must look nonexistent (404).
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
      select: { id: true, userId: true, status: true, total: true, currency: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    if (!PAYABLE_ORDER_STATUSES.includes(order.status as (typeof PAYABLE_ORDER_STATUSES)[number])) {
      throw new ConflictException(
        order.status === 'CANCELLED'
          ? 'لا يمكن الدفع لطلب ملغى'
          : `لا يمكن الدفع لطلب بحالة ${order.status}`,
      );
    }

    const method = (dto.method ?? DEFAULT_PAYMENT_METHOD) as PaymentMethod;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: { userId, key, requestHash, scope: IDEMPOTENCY_SCOPES.PAYMENT },
        });

        // amount/currency come from the Order snapshot — the financial source of truth.
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId,
            method,
            status: PaymentStatus.PENDING,
            amount: order.total,
            currency: order.currency,
            provider: null,
            providerPaymentId: null,
          },
          select: PAYMENT_SELECT,
        });

        await tx.idempotencyKey.update({
          where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.PAYMENT, key } },
          data: { paymentId: payment.id, statusCode: 201 },
        });

        return payment as unknown as PaymentRow;
      }, { timeout: 20000 });

      await this.audit.log({
        action: AUDIT.PAYMENT_CREATED,
        actorId: userId,
        entity: 'payment',
        entityId: created.id,
        metadata: {
          paymentId: created.id,
          orderId: created.orderId,
          orderNumber: order.orderNumber,
          status: created.status,
          amount: toMoneyString(created.amount),
          currency: created.currency,
          method: created.method,
        },
        ...meta,
      });

      return { payment: this.serialize(created), replayed: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Lost the idempotency race: replay the winner's result.
        if (error.code === 'P2002' && error.meta?.target?.toString().includes('scope')) {
          const winner = await this.prisma.idempotencyKey.findUnique({
            where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPES.PAYMENT, key } },
            select: { requestHash: true, paymentId: true },
          });
          if (winner?.paymentId && winner.requestHash === requestHash) {
            const payment = await this.prisma.payment.findUnique({
              where: { id: winner.paymentId }, select: PAYMENT_SELECT,
            });
            if (payment) return { payment: this.serialize(payment as unknown as PaymentRow), replayed: true };
          }
          throw new ConflictException('طلب مكرر قيد المعالجة');
        }
        // One payment per order (DB unique constraint on orderId).
        if (error.code === 'P2002') {
          throw new ConflictException('توجد دفعة مسبقة لهذا الطلب');
        }
      }
      throw error;
    }
  }

  /* -------------------------------- reads --------------------------------- */

  private serializeListRow(row: PaymentRow & { _count?: unknown }) {
    return this.serialize(row);
  }

  async listMine(userId: string, query: ListPaymentsQueryDto) {
    const { page, limit, status, method, sortBy, sortOrder } = query;
    const where: Prisma.PaymentWhereInput = {
      userId,
      ...(status ? { status } : {}),
      ...(method ? { method: method as PaymentMethod } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: (rows as unknown as PaymentRow[]).map((r) => this.serializeListRow(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Customers only see their own payments; staff with payments.read see any. */
  async findOne(paymentId: string, actor: ActorRef) {
    const where: Prisma.PaymentWhereInput = actor.isStaff ? { id: paymentId } : { id: paymentId, userId: actor.id };
    const payment = await this.prisma.payment.findFirst({ where, select: PAYMENT_SELECT });
    // 404 (not 403) so another customer's payment is indistinguishable from a missing one.
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');
    return this.serialize(payment as unknown as PaymentRow);
  }

  async adminList(query: AdminListPaymentsQueryDto) {
    const { page, limit, status, method, orderId, userId, sortBy, sortOrder } = query;
    const where: Prisma.PaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(method ? { method: method as PaymentMethod } : {}),
      ...(orderId ? { orderId } : {}),
      ...(userId ? { userId } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: (rows as unknown as PaymentRow[]).map((r) => this.serializeListRow(r)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /* -------------------------- domain transitions -------------------------- */

  /**
   * Internal domain operation (NOT exposed over HTTP). Strictly validates the
   * state machine and is the single place a future provider callback/verification
   * may use to move a payment forward. `source` documents who triggered it.
   */
  async transition(
    paymentId: string,
    to: PaymentStatusValue,
    context: {
      actorId: string | null;
      source: 'CUSTOMER' | 'ADMIN' | 'PROVIDER' | 'SYSTEM';
      providerPatch?: { provider?: string | null; providerPaymentId?: string | null };
      /** Review metadata (reference/proof/reviewer) applied atomically with the status. */
      extraData?: Prisma.PaymentUncheckedUpdateInput;
    },
    meta: RequestMeta = {},
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: PaymentStatusValue; order_id: number }>>`
        SELECT id, status, order_id FROM payments WHERE id = ${paymentId} FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException('الدفعة غير موجودة');
      const current = rows[0];

      if (!canTransitionPayment(current.status, to)) {
        throw new ConflictException(`انتقال غير مسموح: ${current.status} → ${to}`);
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: to as PaymentStatus,
          ...(context.providerPatch ?? {}),
          ...(context.extraData ?? {}),
        },
        select: PAYMENT_SELECT,
      });
      return { previous: current.status, payment: updated as unknown as PaymentRow };
    }, { timeout: 20000 });

    await this.audit.log({
      action: to === PAYMENT_STATUS.CANCELLED ? AUDIT.PAYMENT_CANCELLED : AUDIT.PAYMENT_STATUS_UPDATED,
      actorId: context.actorId,
      entity: 'payment',
      entityId: paymentId,
      metadata: {
        paymentId,
        orderId: outcome.payment.orderId,
        from: outcome.previous,
        status: to,
        source: context.source,
        amount: toMoneyString(outcome.payment.amount),
        currency: outcome.payment.currency,
      },
      ...meta,
    });

    return this.serialize(outcome.payment);
  }

  /* ------------------- Manual Sham Cash flow (Stage 8) ------------------- */

  /** Receiving account the customer must transfer to (never secret, never fake). */
  getShamCashAccount() {
    const account = shamCashAccountConfig();
    const configured = !!(account.walletNumber && account.accountName);
    return {
      method: DEFAULT_PAYMENT_METHOD,
      configured,
      walletNumber: account.walletNumber,
      accountName: account.accountName,
      instructions: account.instructions,
      currency: account.currency,
      // The customer uploads proof + declares the transfer reference in step 2.
      submitPath: 'POST /api/v1/payments/:id/submit',
    };
  }

  /**
   * POST /payments/:id/submit — the customer declares the manual transfer:
   * transaction reference + proof URL. PENDING → PENDING_REVIEW, then a human
   * decides. Never touches inventory, cart or the order.
   */
  async submitProof(
    paymentId: string,
    userId: string,
    dto: SubmitPaymentProofDto,
    meta: RequestMeta = {},
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      select: { id: true, status: true, orderId: true, amount: true, currency: true },
    });
    // 404 (not 403): another customer's payment must look nonexistent.
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');

    if (!CUSTOMER_SUBMITTABLE_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException(
        payment.status === PAYMENT_STATUS.PENDING_REVIEW
          ? 'تم إرسال إثبات الدفع مسبقاً وهو قيد المراجعة'
          : `لا يمكن إرسال إثبات لدفعة بحالة ${payment.status}`,
      );
    }

    const reference = dto.transactionReference.trim().toUpperCase();
    const duplicate = await this.prisma.payment.findUnique({
      where: { transactionReference: reference },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== paymentId) {
      throw new ConflictException('رقم العملية مستخدم مسبقاً في دفعة أخرى');
    }

    const stored = await this.storage.put(dto.proofUrl);

    const serialized = await this.transition(
      paymentId,
      PAYMENT_STATUS.PENDING_REVIEW,
      {
        actorId: userId,
        source: 'CUSTOMER', // customer-declared evidence, not a decision
        extraData: {
          transactionReference: reference,
          proofUrl: stored.url,
          proofNote: dto.proofNote ?? null,
          submittedAt: new Date(),
        },
      },
      meta,
    );

    await this.audit.log({
      action: AUDIT.PAYMENT_SUBMITTED_FOR_REVIEW,
      actorId: userId,
      entity: 'payment',
      entityId: paymentId,
      metadata: {
        paymentId,
        orderId: payment.orderId,
        status: PAYMENT_STATUS.PENDING_REVIEW,
        amount: toMoneyString(payment.amount),
        currency: payment.currency,
        transactionReference: reference,
        source: 'CUSTOMER',
      },
      ...meta,
    });

    return serialized;
  }

  /**
   * POST /admin/payments/:id/confirm — employee verified the transfer against the
   * Sham Cash statement. PENDING_REVIEW → SUCCEEDED (row-locked, so a concurrent
   * reject/confirm cannot corrupt the outcome).
   */
  async confirm(paymentId: string, actor: ActorRef, meta: RequestMeta = {}) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, orderId: true, transactionReference: true, amount: true, currency: true },
    });
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');
    if (!REVIEWABLE_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException(`لا يمكن تأكيد دفعة بحالة ${payment.status}`);
    }
    if (!payment.transactionReference) {
      // Defence in depth: the DB CHECK enforces this too.
      throw new ConflictException('لا يوجد رقم عملية لهذه الدفعة');
    }

    const serialized = await this.transition(
      paymentId,
      PAYMENT_STATUS.SUCCEEDED,
      {
        actorId: actor.id,
        source: 'ADMIN',
        extraData: { reviewedAt: new Date(), reviewedBy: actor.id, rejectionReason: null },
      },
      meta,
    );

    await this.audit.log({
      action: AUDIT.PAYMENT_CONFIRMED,
      actorId: actor.id,
      entity: 'payment',
      entityId: paymentId,
      metadata: {
        paymentId,
        orderId: payment.orderId,
        status: PAYMENT_STATUS.SUCCEEDED,
        amount: toMoneyString(payment.amount),
        currency: payment.currency,
        transactionReference: payment.transactionReference,
        source: 'ADMIN',
      },
      ...meta,
    });

    return serialized;
  }

  /**
   * POST /admin/payments/:id/reject — the declared transfer could not be verified.
   * PENDING_REVIEW → FAILED with a mandatory reason.
   */
  async reject(paymentId: string, actor: ActorRef, reason: string, meta: RequestMeta = {}) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, orderId: true, amount: true, currency: true },
    });
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');
    if (!REVIEWABLE_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException(`لا يمكن رفض دفعة بحالة ${payment.status}`);
    }

    const serialized = await this.transition(
      paymentId,
      PAYMENT_STATUS.FAILED,
      {
        actorId: actor.id,
        source: 'ADMIN',
        extraData: { reviewedAt: new Date(), reviewedBy: actor.id, rejectionReason: reason },
      },
      meta,
    );

    await this.audit.log({
      action: AUDIT.PAYMENT_REJECTED,
      actorId: actor.id,
      entity: 'payment',
      entityId: paymentId,
      metadata: {
        paymentId,
        orderId: payment.orderId,
        status: PAYMENT_STATUS.FAILED,
        amount: toMoneyString(payment.amount),
        currency: payment.currency,
        reason,
        source: 'ADMIN',
      },
      ...meta,
    });

    return serialized;
  }

  /**
   * Administrative cancellation — the only status-changing endpoint in Stage 7.
   * It can only cancel (never SUCCEEDED/FAILED), validates the transition and
   * locks the row so a double cancellation cannot happen.
   */
  async cancel(paymentId: string, actor: ActorRef, reason: string | undefined, meta: RequestMeta = {}) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, providerPaymentId: true },
    });
    if (!payment) throw new NotFoundException('الدفعة غير موجودة');

    if (!ADMIN_CANCELLABLE_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException(`لا يمكن إلغاء دفعة بحالة ${payment.status}`);
    }
    if (payment.providerPaymentId) {
      // A provider-side payment exists → cancellation must go through the provider
      // flow (later stage), never through a local status flip.
      throw new ConflictException('الدفعة مرتبطة بمزوّد — الإلغاء يتطلب مسار المزوّد');
    }

    const serialized = await this.transition(
      paymentId,
      PAYMENT_STATUS.CANCELLED,
      { actorId: actor.id, source: 'ADMIN' },
      meta,
    );

    this.logger.log(`payment ${paymentId} cancelled by ${actor.id} (${reason ?? 'no reason'})`);
    return { ...(serialized as Record<string, unknown>), cancellationReason: reason ?? null };
  }
}
