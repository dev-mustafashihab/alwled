import { Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { CartService } from './cart.service';
import { CART_ISSUE, CartProductRow } from './cart.constants';

const product = (over: Partial<CartProductRow> = {}): CartProductRow =>
  ({
    id: 1,
    name: 'Demo Product',
    slug: 'demo-product',
    sku: 'DEMO-1',
    price: new Prisma.Decimal('199.99'),
    isActive: true,
    category: { id: 1, isActive: true },
    brand: { id: 1, isActive: true },
    images: [{ url: 'https://cdn.example.com/a.webp', isPrimary: true, altText: null }],
    inventory: { quantity: 10, reservedQuantity: 0 },
    ...over,
  }) as CartProductRow;

const build = () => {
  const prisma = {} as never;
  const audit = { log: jest.fn() } as never;
  return new CartService(prisma, audit);
};

const cartWith = (lines: Array<{ id: number; quantity: number; product: CartProductRow }>) =>
  ({
    id: 5,
    updatedAt: new Date(),
    items: lines.map((l) => ({ id: l.id, productId: l.product.id, quantity: l.quantity, product: l.product })),
  }) as never;

describe('CartService — totals & availability', () => {
  it('returns an empty representation when the user has no cart', () => {
    const view = build().buildCartView(null);
    expect(view).toMatchObject({ id: null, items: [], itemCount: 0, totalQuantity: 0, subtotal: '0.00' });
    expect(view.isCheckoutReady).toBe(false);
  });

  it('computes line subtotals and cart subtotal with decimal precision', () => {
    const view = build().buildCartView(
      cartWith([
        { id: 1, quantity: 3, product: product({ id: 1, price: new Prisma.Decimal('0.07') }) },
        { id: 2, quantity: 2, product: product({ id: 2, price: new Prisma.Decimal('199.99') }) },
      ]),
    );
    expect(view.items[0].lineSubtotal).toBe('0.21');
    expect(view.items[1].lineSubtotal).toBe('399.98');
    expect(view.subtotal).toBe('400.19');
    expect(view.totalQuantity).toBe(5);
    expect(view.itemCount).toBe(2);
    expect(view.isCheckoutReady).toBe(true);
  });

  it('flags unavailable lines instead of dropping them', () => {
    const view = build().buildCartView(
      cartWith([
        { id: 1, quantity: 2, product: product({ id: 1, isActive: false }) },
        { id: 2, quantity: 2, product: product({ id: 2, inventory: { quantity: 5, reservedQuantity: 5 } }) },
        { id: 3, quantity: 9, product: product({ id: 3, inventory: { quantity: 4, reservedQuantity: 1 } }) },
      ]),
    );
    expect(view.items.length).toBe(3);
    expect(view.items[0].issues).toContain(CART_ISSUE.PRODUCT_INACTIVE);
    expect(view.items[0].isAvailable).toBe(false);
    expect(view.items[1].issues).toContain(CART_ISSUE.OUT_OF_STOCK);
    expect(view.items[2].issues).toContain(CART_ISSUE.INSUFFICIENT_STOCK);
    expect(view.items[2].availableQuantity).toBe(3);
    expect(view.isCheckoutReady).toBe(false);
    expect(view.issues).toEqual(
      expect.arrayContaining([CART_ISSUE.PRODUCT_INACTIVE, CART_ISSUE.OUT_OF_STOCK, CART_ISSUE.INSUFFICIENT_STOCK]),
    );
  });

  it('treats a missing inventory row as out of stock', () => {
    const view = build().buildCartView(
      cartWith([{ id: 1, quantity: 1, product: product({ inventory: null }) }]),
    );
    expect(view.items[0].availableQuantity).toBe(0);
    expect(view.items[0].issues).toContain(CART_ISSUE.OUT_OF_STOCK);
  });

  it('uses the product price at read time (no stored price in the cart)', () => {
    const service = build();
    const before = service.buildCartView(cartWith([{ id: 1, quantity: 1, product: product() }]));
    const after = service.buildCartView(
      cartWith([{ id: 1, quantity: 1, product: product({ price: new Prisma.Decimal('149.50') }) }]),
    );
    expect(before.items[0].unitPrice).toBe('199.99');
    expect(after.items[0].unitPrice).toBe('149.50');
  });

  it('exposes ownership enforcement for defence in depth', () => {
    const service = build();
    expect(() => service.assertOwnership('user-a', 'user-a')).not.toThrow();
    expect(() => service.assertOwnership('user-a', 'user-b')).toThrow(ForbiddenException);
  });

  it('hides product internals: only public fields are serialized', () => {
    const view = build().buildCartView(cartWith([{ id: 1, quantity: 1, product: product() }]));
    const line = view.items[0] as unknown as Record<string, unknown>;
    expect(Object.keys(line.product as Record<string, unknown>).sort()).toEqual(
      ['id', 'isActive', 'name', 'price', 'primaryImage', 'sku', 'slug'].sort(),
    );
    expect(JSON.stringify(view)).not.toContain('reservedQuantity');
    expect(JSON.stringify(view)).not.toContain('lowStockThreshold');
  });
});
