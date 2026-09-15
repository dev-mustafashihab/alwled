import { Prisma } from '@prisma/client';

/** Stage 6 keeps the payment-agnostic lifecycle only. */
export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatusValue = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * State machine: PENDING → CONFIRMED → (CANCELLED) and PENDING → CANCELLED.
 * CANCELLED is terminal — no transition leaves it.
 */
export const ORDER_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};

export const canTransition = (from: OrderStatusValue, to: OrderStatusValue): boolean =>
  (ORDER_TRANSITIONS[from] ?? []).includes(to);

/** Statuses a customer may cancel from (admin rules are wider). */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatusValue[] = ['PENDING'];

export const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  shippingAmount: true,
  discountAmount: true,
  total: true,
  currency: true,
  createdAt: true,
  cancelledAt: true,
  cancellationReason: true,
  _count: { select: { items: true } },
} as const satisfies Prisma.OrderSelect;

export const ORDER_DETAIL_SELECT = {
  ...ORDER_LIST_SELECT,
  userId: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      productSku: true,
      productSlug: true,
      productImage: true,
      unitPrice: true,
      quantity: true,
      lineSubtotal: true,
    },
    orderBy: { id: 'asc' },
  },
} as const satisfies Prisma.OrderSelect;
