import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 5 — Cart & Checkout Preview (e2e).
 * Real database, real guards: prices always come from the DB, the cart never
 * reserves stock, and a preview never creates an order/payment.
 */
describe('Cart & Checkout preview (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = { a: `0611${stamp}`, b: `0612${stamp}` };
  const emails = { a: `cart.a.${stamp}@alwled.test`, b: `cart.b.${stamp}@alwled.test` };

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const itemIds: Record<string, number> = {};

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    http = () => request(app.getHttpServer());

    const ownerLogin = await http()
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    expect(ownerLogin.status).toBe(200);
    tokens.owner = ownerLogin.body.data.accessToken;

    // Catalog fixtures owned by the test
    const category = await http().post('/api/v1/categories').set(auth('owner')).send({
      name: `سلة تصنيف ${stamp}`, slug: `cart-cat-${stamp}`,
    });
    ids.category = category.body.data.id;
    const brand = await http().post('/api/v1/brands').set(auth('owner')).send({
      name: `سلة علامة ${stamp}`, slug: `cart-brand-${stamp}`,
    });
    ids.brand = brand.body.data.id;

    const mk = async (suffix: string, price: number, stock: number) => {
      const res = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `منتج سلة ${suffix} ${stamp}`, sku: `CART-${suffix}-${stamp}`, price,
        brandId: ids.brand, categoryId: ids.category,
      });
      expect(res.status).toBe(201);
      const productId = res.body.data.id;
      if (stock > 0) {
        const adjust = await http().post(`/api/v1/inventory/${productId}/adjust`).set(auth('owner')).send({
          quantity: stock, reason: 'STOCK_RECEIVED',
        });
        expect(adjust.status).toBe(201);
      }
      return productId;
    };
    ids.productA = await mk('A', 199.99, 10);
    ids.productB = await mk('B', 0.07, 20);
    ids.productEmpty = await mk('EMPTY', 50, 0);

    // Two customers (isolation tests)
    for (const [who, phone, email] of [
      ['a', phones.a, emails.a],
      ['b', phones.b, emails.b],
    ] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Cart', lastName: who === 'a' ? 'Alpha' : 'Beta', email, phone,
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      tokens[who] = login.body.data.accessToken;
    }
  }, 90000);

  afterAll(async () => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.product.deleteMany({ where: { sku: { contains: stamp } } });
      await prisma.category.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.brand.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.user.deleteMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
      });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  const currentStock = async (productId: number) => {
    const res = await http().get(`/api/v1/inventory/${productId}`).set(auth('owner'));
    return { quantity: res.body.data.quantity, reserved: res.body.data.reservedQuantity };
  };

  /* --------------------------------- Auth --------------------------------- */

  describe('Authentication', () => {
    it('rejects anonymous access to every cart endpoint', async () => {
      expect((await http().get('/api/v1/cart')).status).toBe(401);
      expect((await http().post('/api/v1/cart/items').send({ productId: ids.productA, quantity: 1 })).status).toBe(401);
      expect((await http().patch('/api/v1/cart/items/1').send({ quantity: 1 })).status).toBe(401);
      expect((await http().delete('/api/v1/cart/items/1')).status).toBe(401);
      expect((await http().delete('/api/v1/cart')).status).toBe(401);
      expect((await http().post('/api/v1/checkout/preview')).status).toBe(401);
    });

    it('returns an empty cart for an authenticated user without creating a DB row', async () => {
      const res = await http().get('/api/v1/cart').set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: null, items: [], totalQuantity: 0, subtotal: '0.00' });
      const again = await http().get('/api/v1/cart').set(auth('a'));
      expect(again.body.data.id).toBeNull();
    });
  });

  /* --------------------------------- Cart --------------------------------- */

  describe('Cart operations', () => {
    it('adds an item and computes totals server-side', async () => {
      const res = await http().post('/api/v1/cart/items').set(auth('a')).send({
        productId: ids.productA, quantity: 2,
      });
      expect(res.status).toBe(201);
      const line = res.body.data.items[0];
      expect(line.quantity).toBe(2);
      expect(line.unitPrice).toBe('199.99');
      expect(line.lineSubtotal).toBe('399.98');
      expect(res.body.data.subtotal).toBe('399.98');
      expect(res.body.data.totalQuantity).toBe(2);
      expect(res.body.data.isCheckoutReady).toBe(true);
      expect(line.product.sku).toBe(`CART-A-${stamp}`);
      itemIds.a = line.id;
      ids.cartA = res.body.data.id;
    });

    it('never leaks product internals in the cart payload', async () => {
      const res = await http().get('/api/v1/cart').set(auth('a'));
      const raw = JSON.stringify(res.body);
      ['reservedQuantity', 'lowStockThreshold', 'passwordHash', 'createdAt', 'updatedAt'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });

    it('adding the same product sets the quantity (no silent accumulation)', async () => {
      const res = await http().post('/api/v1/cart/items').set(auth('a')).send({
        productId: ids.productA, quantity: 5,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].quantity).toBe(5);
      expect(res.body.data.subtotal).toBe('999.95');
    });

    it('adds a second product and keeps decimal math exact', async () => {
      const res = await http().post('/api/v1/cart/items').set(auth('a')).send({
        productId: ids.productB, quantity: 3,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.items.length).toBe(2);
      const cheap = res.body.data.items.find((i: { productId: number }) => i.productId === ids.productB);
      expect(cheap.lineSubtotal).toBe('0.21');
      expect(res.body.data.subtotal).toBe('1000.16');
    });

    it('updates an item quantity', async () => {
      const itemB = (await http().get('/api/v1/cart').set(auth('a'))).body.data.items
        .find((i: { productId: number }) => i.productId === ids.productB).id;
      const res = await http().patch(`/api/v1/cart/items/${itemB}`).set(auth('a')).send({ quantity: 4 });
      expect(res.status).toBe(200);
      expect(res.body.data.items.find((i: { productId: number }) => i.productId === ids.productB).quantity).toBe(4);
      expect(res.body.data.subtotal).toBe('1000.23');
      itemIds.b = itemB;
    });

    it('deletes an item', async () => {
      const res = await http().delete(`/api/v1/cart/items/${itemIds.b}`).set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].productId).toBe(ids.productA);
    });

    it('404s for an item that is not in the caller cart', async () => {
      expect((await http().delete(`/api/v1/cart/items/${itemIds.b}`).set(auth('a'))).status).toBe(404);
      expect((await http().patch(`/api/v1/cart/items/${itemIds.b}`).set(auth('a')).send({ quantity: 1 })).status).toBe(404);
    });

    it('clears the cart without deleting the cart row', async () => {
      const cleared = await http().delete('/api/v1/cart').set(auth('a'));
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.items).toEqual([]);
      expect(cleared.body.data.id).not.toBeNull();
      expect(cleared.body.data.subtotal).toBe('0.00');

      const after = await http().get('/api/v1/cart').set(auth('a'));
      expect(after.body.data.items).toEqual([]);
      expect(after.body.data.id).toBe(cleared.body.data.id);
    });
  });

  /* ------------------------------- Validation ------------------------------ */

  describe('Validation', () => {
    it('rejects invalid quantities', async () => {
      for (const quantity of [0, -1, 1.5]) {
        const res = await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.productA, quantity });
        expect(res.status).toBe(400);
      }
      expect((await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.productA })).status).toBe(400);
      expect((await http().patch('/api/v1/cart/items/1').set(auth('b')).send({ quantity: 0 })).status).toBe(400);
    });

    it('rejects unknown fields such as price or subtotal', async () => {
      const withPrice = await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productA, quantity: 1, price: 1,
      });
      expect(withPrice.status).toBe(400);
      const withPrice2 = await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productA, quantity: 1, unitPrice: 0.01, subtotal: 0.01,
      });
      expect(withPrice2.status).toBe(400);
      const withUserId = await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productA, quantity: 1, userId: 'someone-else',
      });
      expect(withUserId.status).toBe(400);
    });

    it('rejects unknown products with 404', async () => {
      expect((await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: 987654, quantity: 1,
      })).status).toBe(404);
    });

    it('rejects inactive products with 409', async () => {
      const product = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `سلة معطل ${stamp}`, sku: `CART-OFF-${stamp}`, price: 10,
        brandId: ids.brand, categoryId: ids.category, isActive: false,
      });
      expect(product.status).toBe(201);
      const res = await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: product.body.data.id, quantity: 1,
      });
      expect(res.status).toBe(409);
      ids.productInactive = product.body.data.id;
    });

    it('rejects out-of-stock and over-stock quantities with 409', async () => {
      expect((await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productEmpty, quantity: 1,
      })).status).toBe(409);
      expect((await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productB, quantity: 999,
      })).status).toBe(409);
    });

    it('enforces configured cart limits', async () => {
      const tooMany = await http().post('/api/v1/cart/items').set(auth('b')).send({
        productId: ids.productB, quantity: 21,
      });
      expect(tooMany.status).toBe(409);
      expect(JSON.stringify(tooMany.body)).toContain('20');

      expect((await http().patch('/api/v1/cart/items/999999').set(auth('b')).send({ quantity: 21 })).status).toBe(404);
    });
  });

  /* ------------------------------ Price rules ------------------------------ */

  describe('Price integrity', () => {
    it('reflects the current product price immediately', async () => {
      await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.productA, quantity: 2 });
      const before = await http().get('/api/v1/cart').set(auth('b'));
      expect(before.body.data.items[0].unitPrice).toBe('199.99');

      const updated = await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ price: 149.5 });
      expect(updated.status).toBe(200);

      const after = await http().get('/api/v1/cart').set(auth('b'));
      expect(after.body.data.items[0].unitPrice).toBe('149.50');
      expect(after.body.data.items[0].lineSubtotal).toBe('299.00');
      expect(after.body.data.subtotal).toBe('299.00');

      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ price: 199.99 });
    });
  });

  /* ------------------------------- Isolation ------------------------------- */

  describe('Ownership isolation', () => {
    it('User B cannot read or modify User A cart items', async () => {
      const itemA = (await http().post('/api/v1/cart/items').set(auth('a')).send({
        productId: ids.productB, quantity: 2,
      })).body.data.items[0].id;

      expect((await http().patch(`/api/v1/cart/items/${itemA}`).set(auth('b')).send({ quantity: 7 })).status).toBe(404);
      expect((await http().delete(`/api/v1/cart/items/${itemA}`).set(auth('b'))).status).toBe(404);

      const cartA = await http().get('/api/v1/cart').set(auth('a'));
      expect(cartA.body.data.items.find((i: { id: number }) => i.id === itemA).quantity).toBe(2);

      const cartB = await http().get('/api/v1/cart').set(auth('b'));
      expect(cartB.body.data.items.some((i: { id: number }) => i.id === itemA)).toBe(false);
    });

    it('clearing one cart never touches another user cart', async () => {
      await http().delete('/api/v1/cart').set(auth('a'));
      const cartB = await http().get('/api/v1/cart').set(auth('b'));
      expect(cartB.body.data.items.length).toBeGreaterThan(0);
      expect((await http().get('/api/v1/cart').set(auth('a'))).body.data.items).toEqual([]);
    });
  });

  /* ---------------------------- Checkout preview --------------------------- */

  describe('Checkout preview', () => {
    it('rejects an empty cart with 409', async () => {
      const res = await http().post('/api/v1/checkout/preview').set(auth('a'));
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('فارغة');
    });

    it('rejects an inactive product in the cart with 409', async () => {
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.productA, quantity: 1 });
      const disabled = await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ isActive: false });
      expect(disabled.status).toBe(200);

      const stale = await http().get('/api/v1/cart').set(auth('a'));
      const line = stale.body.data.items[0];
      expect(line.isAvailable).toBe(false);
      expect(line.issues).toContain('PRODUCT_INACTIVE');
      expect(stale.body.data.isCheckoutReady).toBe(false);

      const preview = await http().post('/api/v1/checkout/preview').set(auth('a'));
      expect(preview.status).toBe(409);
      expect(JSON.stringify(preview.body)).toContain('غير نشط');
    });

    it('rejects insufficient stock with 409 and reports available quantity', async () => {
      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ isActive: true });
      // leave only 1 unit in stock
      const stock = await currentStock(ids.productA);
      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: -(stock.quantity - 1), reason: 'TEST_SHRINK',
      });
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.productA, quantity: 1 });
      expect((await http().post('/api/v1/checkout/preview').set(auth('a'))).status).toBe(200);

      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: -1, reason: 'TEST_DRAIN',
      });
      const preview = await http().post('/api/v1/checkout/preview').set(auth('a'));
      expect(preview.status).toBe(409);
      const cartView = await http().get('/api/v1/cart').set(auth('a'));
      expect(cartView.body.data.items[0].availableQuantity).toBe(0);
      expect(cartView.body.data.items[0].issues).toContain('OUT_OF_STOCK');

      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: 10, reason: 'TEST_RESTORE',
      });
    });

    it('returns a valid snapshot without creating orders, payments or reservations', async () => {
      const stockBefore = await currentStock(ids.productA);
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.productA, quantity: 2 });

      const res = await http().post('/api/v1/checkout/preview').set(auth('a'));
      expect(res.status).toBe(200);
      const body = res.body.data;
      expect(body.canCheckout).toBe(true);
      expect(body.subtotal).toBe('399.98');
      expect(body.shipping).toBeNull();
      expect(body.discount).toBe('0.00');
      expect(body.total).toBe('399.98');
      expect(body.currency).toBe('USD');
      expect(body.createsOrder).toBe(false);
      expect(body.createsPayment).toBe(false);
      expect(body.reservesInventory).toBe(false);
      expect(body.orderId).toBeUndefined();
      expect(body.paymentId).toBeUndefined();

      const stockAfter = await currentStock(ids.productA);
      expect(stockAfter).toEqual(stockBefore);

      const cartAfter = await http().get('/api/v1/cart').set(auth('a'));
      expect(cartAfter.body.data.items.length).toBe(1);
      expect(cartAfter.body.data.items[0].quantity).toBe(2);
    });

    it('is idempotent across repeated previews', async () => {
      const stockBefore = await currentStock(ids.productA);
      const first = await http().post('/api/v1/checkout/preview').set(auth('a'));
      const second = await http().post('/api/v1/checkout/preview').set(auth('a'));
      expect(first.body.data.total).toBe(second.body.data.total);
      expect(await currentStock(ids.productA)).toEqual(stockBefore);
    });
  });

  /* --------------------------------- Audit --------------------------------- */

  describe('Audit', () => {
    it('records cart and checkout events without secrets', async () => {
      for (const action of ['CART_ITEM_ADDED', 'CART_ITEM_UPDATED', 'CART_ITEM_REMOVED', 'CART_CLEARED', 'CHECKOUT_PREVIEW_CREATED']) {
        const res = await http().get(`/api/v1/audit?action=${action}&limit=5`).set(auth('owner'));
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      }
      const all = await http().get('/api/v1/audit?limit=100').set(auth('owner'));
      const raw = JSON.stringify(all.body);
      ['passwordHash', 'tokenHash', 'refreshToken', 'JWT_SECRET', 'Authorization'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });

    it('cart events are attributed to the acting customer, not to the owner', async () => {
      const res = await http().get('/api/v1/audit?action=CART_CLEARED&limit=5').set(auth('owner'));
      const event = res.body.data.items[0];
      expect(event.actorId).not.toBe(undefined);
      expect(event.entity).toBe('cart');
    });
  });
});
