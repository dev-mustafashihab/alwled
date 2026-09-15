import { Prisma } from '@prisma/client';

/** Product projection used by cart & checkout preview (no N+1: one query per cart load). */
export const CART_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  price: true,
  isActive: true,
  category: { select: { id: true, isActive: true } },
  brand: { select: { id: true, isActive: true } },
  images: {
    select: { url: true, isPrimary: true, altText: true },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
  },
  inventory: { select: { quantity: true, reservedQuantity: true } },
} as const satisfies Prisma.ProductSelect;

export interface CartProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string;
  price: Prisma.Decimal;
  isActive: boolean;
  category: { id: number; isActive: boolean };
  brand: { id: number; isActive: boolean };
  images: Array<{ url: string; isPrimary: boolean; altText: string | null }>;
  inventory: { quantity: number; reservedQuantity: number } | null;
}

/** Cart line issue codes surfaced to the client instead of silently dropping lines. */
export const CART_ISSUE = {
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  QUANTITY_LIMIT_EXCEEDED: 'QUANTITY_LIMIT_EXCEEDED',
} as const;

export type CartIssue = (typeof CART_ISSUE)[keyof typeof CART_ISSUE];

/** available = quantity − reservedQuantity (never stored, always computed). */
export const availableQuantityOf = (product: CartProductRow): number => {
  const inventory = product.inventory;
  if (!inventory) return 0;
  return Math.max(0, inventory.quantity - inventory.reservedQuantity);
};

export const isProductPublishable = (product: CartProductRow): boolean =>
  product.isActive && product.category.isActive && product.brand.isActive;

/** Line-level validation used by GET /cart and checkout preview. */
export const cartLineIssues = (product: CartProductRow, quantity: number): CartIssue[] => {
  const issues: CartIssue[] = [];
  if (!product.isActive) issues.push(CART_ISSUE.PRODUCT_INACTIVE);
  if (!isProductPublishable(product)) issues.push(CART_ISSUE.PRODUCT_UNAVAILABLE);

  const available = availableQuantityOf(product);
  if (available <= 0) issues.push(CART_ISSUE.OUT_OF_STOCK);
  else if (available < quantity) issues.push(CART_ISSUE.INSUFFICIENT_STOCK);

  return issues;
};
