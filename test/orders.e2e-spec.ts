import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 6 — Orders, immutable snapshots, inventory reservation, cancellation,
 * idempotency and real concurrency. Everything goes through HTTP + a real
 * PostgreSQL instance, so row locking and DB constraints are exercised for real.
 */
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = {
    a: `0511${stamp}`,
    b: `0512${stamp}`,
    staffNoPerm: `0513${stamp}`,
    staffRead: `0514${stamp}`,
  };
  const emails = {
    a: `ord.a.${stamp}@alwled.test`,
    b: `ord.b.${stamp}@alwled.test`,
    staffNoPerm: `ord.np.${stamp}@alwled.test`,
    staffRead: `ord.rd.${stamp}@alwled.test`,
  };

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let seq = 0;
  const nextKey = () => `key-${stamp}-${++seq}`;

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const order = (who: string, key = nextKey(), body: Record<string, unknown> = {}) =>
    http().post('/api/v1/orders').set({ ...auth(who), 'Idempotency-Key': key }).send(body);

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
    tokens.owner = ownerLogin.body.data.accessToken;

    // catalog fixtures
    const category = await http().post('/api/v1/categories').set(auth('owner')).send({
      name: `طلبات تصنيف ${stamp}`, slug: `ord-cat-${stamp}`,
    });
    ids.category = category.body.data.id;
    const brand = await http().post('/api/v1/brands').set(auth('owner')).send({
      name: `طلبات علامة ${stamp}`, slug: `ord-brand-${stamp}`,
    });
    ids.brand = brand.body.data.id;

    const mkProduct = async (suffix: string, price: number, stock: number) => {
      const res = await http().post('/api/v1/products').set(auth('owner')).send({
        name: `منتج طلبات ${suffix} ${stamp}`, sku: `ORD-${suffix}-${stamp}`, price,
        brandId: ids.brand, categoryId: ids.category,
      });
      expect(res.status).toBe(201);
      if (stock > 0) {
        await http().post(`/api/v1/inventory/${res.body.data.id}/adjust`).set(auth('owner')).send({
          quantity: stock, reason: 'STOCK_RECEIVED',
        });
      }
      return res.body.data.id;
    };
    ids.productA = await mkProduct('A', 199.99, 20);   // general purpose
    ids.productB = await mkProduct('B', 0.07, 30);     // decimal precision
    ids.productTight = await mkProduct('T', 50, 4);    // concurrency
    ids.productEmpty = await mkProduct('E', 10, 0);    // out of stock
    ids.productInactive = await mkProduct('I', 10, 5);          // kept inactive
    await http().patch(`/api/v1/products/${ids.productInactive}`).set(auth('owner')).send({ isActive: false });
    ids.productStale = await mkProduct('S', 30, 5);              // disabled mid-cart

    // customers
    for (const [who, phone, email] of [
      ['a', phones.a, emails.a],
      ['b', phones.b, emails.b],
    ] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Order', lastName: who === 'a' ? 'Alpha' : 'Beta', email, phone,
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      tokens[who] = login.body.data.accessToken;
    }

    // staff: one with orders.read/update (EMPLOYEE), one without any orders permission
    const noPermRole = await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `ORDNOPERM_${stamp}`, description: 'بدون صلاحيات طلبات',
    });
    expect(noPermRole.status).toBe(201);
    ids.noPermRole = noPermRole.body.data.id;

    const staffNoPerm = await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Staff', lastName: 'NoPerm', email: emails.staffNoPerm, phone: phones.staffNoPerm,
      password: pass, roleName: `ORDNOPERM_${stamp}`,
    });
    expect(staffNoPerm.status).toBe(201);
    ids.staffNoPerm = staffNoPerm.body.data.id;

    const staffRead = await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Staff', lastName: 'Reader', email: emails.staffRead, phone: phones.staffRead, password: pass,
    });
    expect(staffRead.status).toBe(201);

    for (const [who, phone] of [['staffNoPerm', phones.staffNoPerm], ['staffRead', phones.staffRead]] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
    }
  }, 120000);

  afterAll(async () => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const testUsers = await prisma.user.findMany({
        where: {
          OR: [
            { phone: { in: Object.values(phones) } },
            { email: { in: Object.values(emails) } },
          ],
        },
        select: { id: true },
      });
      await prisma.order.deleteMany({ where: { userId: { in: testUsers.map((u) => u.id) } } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: testUsers.map((u) => u.id) } } });
      await prisma.product.deleteMany({ where: { sku: { contains: stamp } } });
      await prisma.category.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.brand.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.role.deleteMany({ where: { name: `ORDNOPERM_${stamp}`, isSystem: false, users: { none: {} } } });
      await prisma.user.deleteMany({ where: { id: { in: testUsers.map((u) => u.id) } } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  const stockOf = async (productId: number) => {
    const res = await http().get(`/api/v1/inventory/${productId}`).set(auth('owner'));
    return {
      quantity: res.body.data.quantity as number,
      reserved: res.body.data.reservedQuantity as number,
      available: res.body.data.availableQuantity as number,
    };
  };
  const addToCart = async (who: string, productId: number, quantity: number) =>
    http().post('/api/v1/cart/items').set(auth(who)).send({ productId, quantity });
  const cartState = async (who: string) => {
    const res = await http().get('/api/v1/cart').set(auth(who));
    return res.body.data.items as Array<{ productId: number; quantity: number }>;
  };
  const countOrders = async () => {
    const res = await http().get('/api/v1/admin/orders?limit=100').set(auth('owner'));
    return res.body.meta.total as number;
  };

  /* ------------------------------ creation ------------------------------ */

  describe('Order creation', () => {
    it('creates an order from the cart with server-side totals', async () => {
      await addToCart('a', ids.productA, 2);
      await addToCart('a', ids.productB, 3);

      const res = await order('a');
      expect(res.status).toBe(201);
      const body = res.body.data;
      expect(body.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
      expect(body.status).toBe('PENDING');
      expect(body.subtotal).toBe('400.19'); // 2×199.99 + 3×0.07
      expect(body.shippingAmount).toBe('0.00');
      expect(body.discountAmount).toBe('0.00');
      expect(body.total).toBe('400.19');
      expect(body.currency).toBe('USD');
      expect(body.itemCount).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.idempotentReplay).toBe(false);
      ids.orderA = body.id;
      ids.orderANumber = body.orderNumber as unknown as number;

      const lineA = body.items.find((i: { productId: number }) => i.productId === ids.productA);
      expect(lineA.productName).toBe(`منتج طلبات A ${stamp}`);
      expect(lineA.productSku).toBe(`ORD-A-${stamp}`);
      expect(lineA.productSlug).toContain(stamp);
      expect(lineA.unitPrice).toBe('199.99');
      expect(lineA.lineSubtotal).toBe('399.98');
    });

    it('clears the cart after a successful order', async () => {
      expect(await cartState('a')).toEqual([]);
    });

    it('reserves stock without touching quantity', async () => {
      const stock = await stockOf(ids.productA);
      expect(stock.quantity).toBe(20);
      expect(stock.reserved).toBe(2);
      expect(stock.available).toBe(18);
      const stockB = await stockOf(ids.productB);
      expect(stockB.quantity).toBe(30);
      expect(stockB.reserved).toBe(3);
    });

    it('records RESERVATION movements referencing the order', async () => {
      const res = await http().get(`/api/v1/inventory/${ids.productA}/movements`).set(auth('owner'));
      const reservation = res.body.data.find((m: { type: string; referenceId: string }) => m.type === 'RESERVATION');
      expect(reservation).toBeDefined();
      expect(reservation.referenceType).toBe('ORDER');
      expect(reservation.referenceId).toBe(String(ids.orderA));
      expect(reservation.quantity).toBe(2);
    });

    it('rejects an empty cart with 409', async () => {
      const res = await order('b');
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('فارغة');
    });

    it('requires an Idempotency-Key header', async () => {
      await addToCart('b', ids.productA, 1);
      const res = await http().post('/api/v1/orders').set(auth('b')).send({});
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('Idempotency-Key');
    });

    it('rejects inactive products with 409 and creates nothing', async () => {
      // The cart refuses inactive products, so the realistic scenario is: add
      // while active, then the product gets disabled before checkout.
      await http().delete('/api/v1/cart').set(auth('b'));
      await addToCart('b', ids.productStale, 2);
      expect(await cartState('b')).toHaveLength(1);
      await http().patch(`/api/v1/products/${ids.productStale}`).set(auth('owner')).send({ isActive: false });

      const before = await countOrders();
      const reservedBefore = (await stockOf(ids.productStale)).reserved;

      const res = await order('b');
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('غير متاح');
      expect(await countOrders()).toBe(before);
      expect(await cartState('b')).toHaveLength(1); // cart untouched
      expect((await stockOf(ids.productStale)).reserved).toBe(reservedBefore);
      const movements = await http().get(`/api/v1/inventory/${ids.productStale}/movements`).set(auth('owner'));
      expect(movements.body.data.some((m: { reason: string }) => m.reason === 'ORDER_RESERVATION')).toBe(false);

      await http().patch(`/api/v1/products/${ids.productStale}`).set(auth('owner')).send({ isActive: true });
      await http().delete('/api/v1/cart').set(auth('b'));
    });

    it('rejects out-of-stock and insufficient quantities with 409', async () => {
      await addToCart('b', ids.productEmpty, 1);
      expect((await order('b')).status).toBe(409);
      await http().delete('/api/v1/cart').set(auth('b'));

      await addToCart('b', ids.productA, 20);
      expect((await order('b')).status).toBe(409);
      await http().delete('/api/v1/cart').set(auth('b'));
    });

    it('rolls back completely on a stale-stock failure', async () => {
      const stockBefore = await stockOf(ids.productA);
      const ordersBefore = await countOrders();
      // cart wants more than what is available right now
      await http().delete('/api/v1/cart').set(auth('b'));
      await addToCart('b', ids.productA, 5);
      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: -10, reason: 'TEST_DRAIN',
      }); // leaves 10 total, 2 reserved → 8 available... then push further

      const stock = await stockOf(ids.productA);
      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: -(stock.available - 2), reason: 'TEST_DRAIN_2',
      });
      const before = await stockOf(ids.productA);
      expect(before.available).toBeLessThan(5);

      const res = await order('b');
      expect(res.status).toBe(409);

      const after = await stockOf(ids.productA);
      expect(after).toEqual(before);                       // no reservation leaked
      expect(await countOrders()).toBe(ordersBefore);       // no order
      expect(await cartState('b')).toHaveLength(1);          // cart unchanged
      const movements = await http().get(`/api/v1/inventory/${ids.productA}/movements`).set(auth('owner'));
      expect(movements.body.data.some((m: { referenceId: string; reason: string }) =>
        m.reason === 'ORDER_RESERVATION' && m.referenceId === '0')).toBe(false);

      await http().post(`/api/v1/inventory/${ids.productA}/adjust`).set(auth('owner')).send({
        quantity: 20, reason: 'TEST_RESTORE',
      });
      await http().delete('/api/v1/cart').set(auth('b'));
      expect(stockBefore.quantity).toBeGreaterThan(0);
    });
  });

  /* ------------------------------ snapshots ------------------------------ */

  describe('Immutable snapshots', () => {
    it('keeps the historical price, name and SKU after the product changes', async () => {
      const orderId = ids.orderA as number;
      const before = await http().get(`/api/v1/orders/${orderId}`).set(auth('a'));
      const lineBefore = before.body.data.items.find((i: { productId: number }) => i.productId === ids.productA);
      expect(lineBefore.unitPrice).toBe('199.99');

      // change name, sku and price on the live product
      const patch = await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({
        name: `منتج مغير ${stamp}`, sku: `CHANGED-${stamp}`, price: 249.99,
      });
      expect(patch.status).toBe(200);

      const after = await http().get(`/api/v1/orders/${orderId}`).set(auth('a'));
      const lineAfter = after.body.data.items.find((i: { productId: number }) => i.productId === ids.productA);
      expect(lineAfter.unitPrice).toBe('199.99');
      expect(lineAfter.lineSubtotal).toBe('399.98');
      expect(lineAfter.productName).toBe(`منتج طلبات A ${stamp}`);
      expect(lineAfter.productSku).toBe(`ORD-A-${stamp}`);
      expect(after.body.data.subtotal).toBe('400.19');
      expect(after.body.data.total).toBe('400.19');

      // restore
      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({
        name: `منتج طلبات A ${stamp}`, sku: `ORD-A-${stamp}`, price: 199.99,
      });
    });

    it('uses the current DB price at order time, not the cart-time price', async () => {
      await addToCart('b', ids.productA, 2);
      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ price: 249.99 });

      const res = await order('b');
      expect(res.status).toBe(201);
      expect(res.body.data.items[0].unitPrice).toBe('249.99');
      expect(res.body.data.total).toBe('499.98');
      ids.orderB = res.body.data.id;

      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ price: 199.99 });
      const later = await http().get(`/api/v1/orders/${ids.orderB}`).set(auth('b'));
      expect(later.body.data.items[0].unitPrice).toBe('249.99');
    });

    it('keeps the order readable after the product is disabled', async () => {
      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ isActive: false });
      const res = await http().get(`/api/v1/orders/${ids.orderA}`).set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      await http().patch(`/api/v1/products/${ids.productA}`).set(auth('owner')).send({ isActive: true });
    });
  });

  /* ------------------------------- security ------------------------------ */

  describe('Security', () => {
    it('requires a JWT', async () => {
      expect((await http().post('/api/v1/orders').set({ 'Idempotency-Key': nextKey() }).send({})).status).toBe(401);
      expect((await http().get('/api/v1/orders')).status).toBe(401);
      expect((await http().get(`/api/v1/orders/${ids.orderA}`)).status).toBe(401);
      expect((await http().post(`/api/v1/orders/${ids.orderA}/cancel`).send({})).status).toBe(401);
      expect((await http().get('/api/v1/admin/orders')).status).toBe(401);
    });

    it('hides another customer order behind 404', async () => {
      expect((await http().get(`/api/v1/orders/${ids.orderA}`).set(auth('b'))).status).toBe(404);
      expect((await http().post(`/api/v1/orders/${ids.orderA}/cancel`).set(auth('b')).send({})).status).toBe(404);
      const listB = await http().get('/api/v1/orders').set(auth('b'));
      expect(listB.body.data.items.some((o: { id: number }) => o.id === ids.orderA)).toBe(false);
    });

    it('ignores/denies userId and price tampering in the request body', async () => {
      await addToCart('a', ids.productB, 1);
      const tampered = await order('a', nextKey(), {
        userId: ids.staffRead, items: [{ productId: ids.productA, quantity: 99, price: 0.01 }], total: 0.01,
      });
      expect(tampered.status).toBe(400); // forbidNonWhitelisted
      await http().delete('/api/v1/cart').set(auth('a'));

      const viaQuery = await http().get('/api/v1/orders?userId=someone').set(auth('a'));
      expect(viaQuery.status).toBe(400);
    });

    it('enforces orders.read / orders.update for staff', async () => {
      expect((await http().get('/api/v1/admin/orders').set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().get(`/api/v1/admin/orders/${ids.orderA}`).set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().patch(`/api/v1/admin/orders/${ids.orderA}/status`).set(auth('staffNoPerm')).send({
        status: 'CONFIRMED',
      })).status).toBe(403);

      const read = await http().get('/api/v1/admin/orders').set(auth('staffRead'));
      expect(read.status).toBe(200);
      expect(read.body.data.items.length).toBeGreaterThanOrEqual(2);

      const detail = await http().get(`/api/v1/admin/orders/${ids.orderA}`).set(auth('staffRead'));
      expect(detail.status).toBe(200);
      expect(detail.body.data.userId).toBeDefined();
    });

    it('never exposes secrets or payment data in order payloads', async () => {
      const res = await http().get(`/api/v1/orders/${ids.orderA}`).set(auth('a'));
      const raw = JSON.stringify(res.body);
      ['passwordHash', 'tokenHash', 'refreshToken', 'paymentId', 'paidAt'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });
  });

  /* ----------------------------- idempotency ----------------------------- */

  describe('Idempotency', () => {
    it('returns the same order for a repeated key and creates only one', async () => {
      await addToCart('a', ids.productB, 2);
      const key = nextKey();
      const first = await order('a', key);
      expect(first.status).toBe(201);
      expect(first.body.data.idempotentReplay).toBe(false);

      const second = await order('a', key);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(second.body.data.idempotentReplay).toBe(true);
      expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);

      const list = await http().get('/api/v1/orders?limit=100').set(auth('a'));
      const sameNumber = list.body.data.items.filter(
        (o: { orderNumber: string }) => o.orderNumber === first.body.data.orderNumber,
      );
      expect(sameNumber).toHaveLength(1);
    });

    it('rejects the same key with different content (409)', async () => {
      const key = nextKey();
      await addToCart('a', ids.productB, 1);
      expect((await order('a', key)).status).toBe(201);
      await addToCart('a', ids.productB, 5); // different cart ⇒ different request
      const clash = await order('a', key);
      expect(clash.status).toBe(409);
      expect(JSON.stringify(clash.body)).toContain('مختلف');
      await http().delete('/api/v1/cart').set(auth('a'));
    });

    it('scopes keys per user', async () => {
      const key = nextKey();
      await addToCart('a', ids.productB, 1);
      await addToCart('b', ids.productB, 1);
      const first = await order('a', key);
      const other = await order('b', key);
      expect(first.status).toBe(201);
      expect(other.status).toBe(201);
      expect(other.body.data.id).not.toBe(first.body.data.id);
      expect(other.body.data.idempotentReplay).toBe(false);
    });
  });

  /* --------------------------- cancellations ---------------------------- */

  describe('Cancellation', () => {
    it('customer cancels a PENDING order and the reservation is released', async () => {
      await addToCart('a', ids.productA, 4);
      const created = await order('a');
      expect(created.status).toBe(201);
      const orderId = created.body.data.id;
      const reserved = await stockOf(ids.productA);
      expect(reserved.reserved).toBeGreaterThanOrEqual(4);
      const quantityBefore = reserved.quantity;

      const cancel = await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth('a')).send({
        reason: 'تغيير في الرأي',
      });
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.status).toBe('CANCELLED');
      expect(cancel.body.data.cancelledAt).toBeDefined();
      expect(cancel.body.data.cancellationReason).toBe('تغيير في الرأي');

      const after = await stockOf(ids.productA);
      expect(after.quantity).toBe(quantityBefore);            // never sold
      expect(after.reserved).toBe(reserved.reserved - 4);

      const movements = await http().get(`/api/v1/inventory/${ids.productA}/movements`).set(auth('owner'));
      const release = movements.body.data.find(
        (m: { type: string; referenceId: string }) => m.type === 'RELEASE' && m.referenceId === String(orderId),
      );
      expect(release).toBeDefined();
      expect(release.quantity).toBe(-4);
    });

    it('rejects a double cancellation with 409 and releases stock exactly once', async () => {
      await http().delete('/api/v1/cart').set(auth('b'));
      await addToCart('b', ids.productB, 3);
      const created = await order('b');
      expect(created.status).toBe(201);
      const orderId = created.body.data.id;

      const reservedAfterOrder = (await stockOf(ids.productB)).reserved;
      const quantityAfterOrder = (await stockOf(ids.productB)).quantity;

      const first = await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth('b')).send({});
      expect(first.status).toBe(200);
      const afterFirst = await stockOf(ids.productB);
      expect(afterFirst.reserved).toBe(reservedAfterOrder - 3);

      const second = await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth('b')).send({});
      expect(second.status).toBe(409);

      const afterSecond = await stockOf(ids.productB);
      expect(afterSecond.reserved).toBe(afterFirst.reserved); // no second release
      expect(afterSecond.quantity).toBe(quantityAfterOrder);  // never sold
    });

    it('rejects invalid status transitions and lets staff confirm/cancel', async () => {
      await addToCart('b', ids.productB, 2);
      const created = await order('b');
      expect(created.status).toBe(201);
      const orderId = created.body.data.id;

      // customer cannot change status through the admin route
      expect((await http().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth('b')).send({
        status: 'CONFIRMED',
      })).status).toBe(403);

      // PENDING → CONFIRMED by staff with orders.update
      const confirm = await http().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth('staffRead')).send({
        status: 'CONFIRMED',
      });
      expect(confirm.status).toBe(200);
      expect(confirm.body.data.status).toBe('CONFIRMED');

      // CONFIRMED → PENDING is not a legal transition
      const backwards = await http().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth('staffRead')).send({
        status: 'PENDING',
      });
      expect(backwards.status).toBe(400); // enum rejects PENDING outright

      // customer can no longer cancel after confirmation
      expect((await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth('b')).send({})).status).toBe(409);

      // staff cancels a CONFIRMED order
      const cancelled = await http().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth('staffRead')).send({
        status: 'CANCELLED', reason: 'طلب العميل',
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      // CANCELLED is terminal
      expect((await http().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth('staffRead')).send({
        status: 'CONFIRMED',
      })).status).toBe(409);
    });

    it('still allows cancelling when the product was disabled afterwards', async () => {
      await addToCart('a', ids.productInactive, 1);
      // product is inactive so ordering is blocked — use an active product instead
      await http().delete('/api/v1/cart').set(auth('a'));
      await addToCart('a', ids.productTight, 1);
      const created = await order('a');
      expect(created.status).toBe(201);

      await http().patch(`/api/v1/products/${ids.productTight}`).set(auth('owner')).send({ isActive: false });
      const cancel = await http().post(`/api/v1/orders/${created.body.data.id}/cancel`).set(auth('a')).send({});
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.status).toBe('CANCELLED');
      await http().patch(`/api/v1/products/${ids.productTight}`).set(auth('owner')).send({ isActive: true });
    });
  });

  /* ------------------------------ concurrency ---------------------------- */

  describe('Concurrency (row-level locking)', () => {
    it('lets exactly one of two simultaneous orders win the last stock', async () => {
      // productTight: 4 units, nothing reserved at the start of this test
      const stock = await stockOf(ids.productTight);
      await http().post(`/api/v1/inventory/${ids.productTight}/adjust`).set(auth('owner')).send({
        quantity: -stock.reserved, reason: 'TEST_RESET_RESERVED',
      });
      await http().post(`/api/v1/inventory/${ids.productTight}/adjust`).set(auth('owner')).send({
        quantity: 4 - (stock.quantity - stock.reserved), reason: 'TEST_RESET_QTY',
      });
      const start = await stockOf(ids.productTight);
      expect(start.available).toBe(4);

      await http().delete('/api/v1/cart').set(auth('a'));
      await http().delete('/api/v1/cart').set(auth('b'));
      await addToCart('a', ids.productTight, 3);
      await addToCart('b', ids.productTight, 3);

      const [resA, resB] = await Promise.all([order('a'), order('b')]);
      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const finalStock = await stockOf(ids.productTight);
      expect(finalStock.quantity).toBe(4);
      expect(finalStock.reserved).toBe(3);      // never 6
      expect(finalStock.available).toBe(1);
      expect(finalStock.available).toBeGreaterThanOrEqual(0);

      // the loser keeps its cart intact and can retry later
      const loser = resA.status === 409 ? 'a' : 'b';
      expect(await cartState(loser)).toHaveLength(1);
    });

    it('keeps the DB CHECK constraints satisfied after all reservations', async () => {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const bad = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM inventory WHERE reserved_quantity > quantity OR quantity < 0 OR reserved_quantity < 0
      `;
      expect(Number(bad[0].count)).toBe(0);
      await prisma.$disconnect();
    });
  });

  /* --------------------------------- audit ------------------------------- */

  describe('Audit', () => {
    it('records order lifecycle events with the acting user and no secrets', async () => {
      for (const action of ['ORDER_CREATED', 'ORDER_CANCELLED', 'ORDER_STATUS_UPDATED',
        'ORDER_RESERVATION_CREATED', 'ORDER_RESERVATION_RELEASED']) {
        const res = await http().get(`/api/v1/audit?action=${action}&limit=5`).set(auth('owner'));
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
      }
      const created = await http().get('/api/v1/audit?action=ORDER_CREATED&limit=5').set(auth('owner'));
      expect(created.body.data.items[0].entity).toBe('order');
      expect(created.body.data.items[0].metadata.orderNumber).toMatch(/^ORD-/);

      const all = await http().get('/api/v1/audit?limit=100').set(auth('owner'));
      const raw = JSON.stringify(all.body);
      ['passwordHash', 'tokenHash', 'Authorization', 'Idempotency-Key'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });
  });
});
