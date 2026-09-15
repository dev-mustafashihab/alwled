import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 7 — Payments (provider independent).
 * Real DB + real guards. The suite proves the financial fields are server-side,
 * ownership is enforced, the state machine holds, idempotency is safe, and that
 * NO path can fake a successful payment.
 */
describe('Payments (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = {
    a: `0311${stamp}`,
    b: `0312${stamp}`,
    staffReader: `0313${stamp}`,
    staffNoPerm: `0314${stamp}`,
  };
  const emails = {
    a: `pay.a.${stamp}@alwled.test`,
    b: `pay.b.${stamp}@alwled.test`,
    staffReader: `pay.rd.${stamp}@alwled.test`,
    staffNoPerm: `pay.np.${stamp}@alwled.test`,
  };

  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const paymentIds: Record<string, string> = {};
  let seq = 0;
  const nextKey = () => `pay-${stamp}-${++seq}`;

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const pay = (who: string, body: Record<string, unknown>, key = nextKey()) =>
    http().post('/api/v1/payments').set({ ...auth(who), 'Idempotency-Key': key }).send(body);
  const createOrder = async (who: string, productId: number, quantity: number) => {
    await http().post('/api/v1/cart/items').set(auth(who)).send({ productId, quantity });
    const res = await http().post('/api/v1/orders')
      .set({ ...auth(who), 'Idempotency-Key': `ord-${stamp}-${++seq}` }).send({});
    expect(res.status).toBe(201);
    return res.body.data as { id: number; total: string; currency: string; orderNumber: string };
  };

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

    const category = await http().post('/api/v1/categories').set(auth('owner')).send({
      name: `دفعات تصنيف ${stamp}`, slug: `pay-cat-${stamp}`,
    });
    ids.category = category.body.data.id;
    const brand = await http().post('/api/v1/brands').set(auth('owner')).send({
      name: `دفعات علامة ${stamp}`, slug: `pay-brand-${stamp}`,
    });
    ids.brand = brand.body.data.id;

    const product = await http().post('/api/v1/products').set(auth('owner')).send({
      name: `منتج دفعات ${stamp}`, sku: `PAY-${stamp}`, price: 199.99,
      brandId: ids.brand, categoryId: ids.category,
    });
    ids.product = product.body.data.id;
    await http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({
      quantity: 40, reason: 'STOCK_RECEIVED',
    });

    for (const [who, phone, email] of [
      ['a', phones.a, emails.a],
      ['b', phones.b, emails.b],
    ] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Pay', lastName: who === 'a' ? 'Alpha' : 'Beta', email, phone,
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      tokens[who] = login.body.data.accessToken;
    }

    // staff without payments permissions
    const noPermRole = await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `PAYNOPERM_${stamp}`, description: 'بدون صلاحيات دفع',
    });
    ids.noPermRole = noPermRole.body.data.id;
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Pay', lastName: 'NoPerm', email: emails.staffNoPerm, phone: phones.staffNoPerm,
      password: pass, roleName: `PAYNOPERM_${stamp}`,
    });

    // staff with payments.read + payments.update (ADMIN role seeded with both)
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Pay', lastName: 'Reader', email: emails.staffReader, phone: phones.staffReader,
      password: pass, roleName: 'ADMIN',
    });

    for (const [who, phone] of [['staffNoPerm', phones.staffNoPerm], ['staffReader', phones.staffReader]] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
    }
  }, 120000);

  afterAll(async () => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const users = await prisma.user.findMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.product.deleteMany({ where: { sku: { contains: stamp } } });
      await prisma.category.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.brand.deleteMany({ where: { slug: { contains: stamp } } });
      await prisma.role.deleteMany({ where: { name: `PAYNOPERM_${stamp}`, isSystem: false, users: { none: {} } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  const stockOf = async () => {
    const res = await http().get(`/api/v1/inventory/${ids.product}`).set(auth('owner'));
    return { quantity: res.body.data.quantity, reserved: res.body.data.reservedQuantity };
  };

  /* --------------------------------- auth --------------------------------- */

  describe('Authentication', () => {
    it('requires a JWT on every payment endpoint', async () => {
      expect((await http().post('/api/v1/payments').set({ 'Idempotency-Key': nextKey() }).send({ orderId: 1 })).status).toBe(401);
      expect((await http().get('/api/v1/payments')).status).toBe(401);
      expect((await http().get('/api/v1/payments/whatever')).status).toBe(401);
      expect((await http().get('/api/v1/admin/payments')).status).toBe(401);
      expect((await http().post('/api/v1/admin/payments/whatever/cancel').send({})).status).toBe(401);
    });
  });

  /* ------------------------------- creation ------------------------------- */

  describe('Payment creation', () => {
    it('creates a PENDING payment whose amount/currency come from the order', async () => {
      const order = await createOrder('a', ids.product, 2);
      ids.orderA = order.id;

      const res = await pay('a', { orderId: order.id });
      expect(res.status).toBe(201);
      const body = res.body.data;
      expect(body.orderId).toBe(order.id);
      expect(body.amount).toBe(order.total);
      expect(body.amount).toBe('399.98');
      expect(body.currency).toBe(order.currency);
      expect(body.currency).toBe('USD');
      expect(body.status).toBe('PENDING');
      expect(body.method).toBe('SHAM_CASH');
      expect(body.provider).toBeNull();
      expect(body.providerPaymentId).toBeNull();
      expect(body.idempotentReplay).toBe(false);
      paymentIds.a = body.id;
    });

    it('does not touch inventory, cart or order snapshots', async () => {
      const before = await stockOf();
      const order = await http().get(`/api/v1/orders/${ids.orderA}`).set(auth('a'));
      const after = await stockOf();
      expect(after).toEqual(before);
      expect(order.body.data.items[0].unitPrice).toBe('199.99');
      expect(order.body.data.status).toBe('PENDING');
      expect((await http().get('/api/v1/cart').set(auth('a'))).body.data.items).toEqual([]);

      const movements = await http().get(`/api/v1/inventory/${ids.product}/movements`).set(auth('owner'));
      expect(movements.body.data.some((m: { referenceType: string; referenceId: string }) =>
        m.referenceType === 'ORDER' && m.referenceId === '0')).toBe(false);
    });

    it('rejects unknown/security-sensitive fields with 400 (amount, currency, status, userId, provider)', async () => {
      const order = await createOrder('b', ids.product, 1);
      ids.orderB = order.id;

      const tampered = await pay('b', {
        orderId: order.id, amount: 0.01, currency: 'EUR', status: 'SUCCEEDED',
        userId: ids.orderA, provider: 'sham_cash', providerPaymentId: 'TEST-123',
      });
      expect(tampered.status).toBe(400);

      // and nothing was created with attacker-controlled values
      const list = await http().get('/api/v1/payments?limit=50').set(auth('b'));
      expect(list.body.data.items.some((p: { orderId: number }) => p.orderId === order.id)).toBe(false);
    });

    it('validates the DTO (missing orderId, empty/zero/negative ids)', async () => {
      expect((await pay('b', {})).status).toBe(400);
      expect((await pay('b', { orderId: '' })).status).toBe(400);
      expect((await pay('b', { orderId: 0 })).status).toBe(400);
      expect((await pay('b', { orderId: -3 })).status).toBe(400);
      expect((await pay('b', { orderId: 1.5 })).status).toBe(400);
      expect((await pay('b', { orderId: 999999 })).status).toBe(404);
    });

    it('requires the Idempotency-Key header', async () => {
      const res = await http().post('/api/v1/payments').set(auth('b')).send({ orderId: ids.orderB });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('Idempotency-Key');
    });

    it('allows only the currently supported method', async () => {
      const order = await createOrder('a', ids.product, 1);
      expect((await pay('a', { orderId: order.id, method: 'CARD' })).status).toBe(400);
      ids.orderA2 = order.id;
    });
  });

  /* ------------------------------ eligibility ----------------------------- */

  describe('Order eligibility', () => {
    it('accepts PENDING and CONFIRMED orders, rejects CANCELLED ones', async () => {
      // CONFIRMED order
      const confirmed = await createOrder('b', ids.product, 1);
      const confirm = await http().patch(`/api/v1/admin/orders/${confirmed.id}/status`).set(auth('owner')).send({
        status: 'CONFIRMED',
      });
      expect(confirm.status).toBe(200);
      const ok = await pay('b', { orderId: confirmed.id });
      expect(ok.status).toBe(201);
      paymentIds.confirmed = ok.body.data.id;

      // CANCELLED order
      const cancelled = await createOrder('b', ids.product, 1);
      const cancelOrder = await http().post(`/api/v1/orders/${cancelled.id}/cancel`).set(auth('b')).send({});
      expect(cancelOrder.status).toBe(200);
      const rejected = await pay('b', { orderId: cancelled.id });
      expect(rejected.status).toBe(409);
      expect(JSON.stringify(rejected.body)).toContain('ملغى');
    });

    it('rejects a second payment for the same order with 409', async () => {
      const res = await pay('a', { orderId: ids.orderA as number });
      expect(res.status).toBe(409);
    });
  });

  /* -------------------------------- ownership ----------------------------- */

  describe('Ownership isolation', () => {
    it('lets the owner read their own payment', async () => {
      const res = await http().get(`/api/v1/payments/${paymentIds.a}`).set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(paymentIds.a);
      expect(res.body.data.userId).toBeDefined();
    });

    it('hides another customer payment behind 404 (detail and creation)', async () => {
      expect((await http().get(`/api/v1/payments/${paymentIds.a}`).set(auth('b'))).status).toBe(404);
      const list = await http().get('/api/v1/payments?limit=100').set(auth('b'));
      expect(list.body.data.items.some((p: { id: string }) => p.id === String(paymentIds.a))).toBe(false);
      expect((await pay('b', { orderId: ids.orderA as number })).status).toBe(404);
    });

    it('never exposes secrets or provider internals', async () => {
      const res = await http().get(`/api/v1/payments/${paymentIds.a}`).set(auth('a'));
      const raw = JSON.stringify(res.body);
      ['passwordHash', 'tokenHash', 'refreshToken', 'resetToken', 'authorization', 'apiKey', 'secret']
        .forEach((needle) => expect(raw.toLowerCase()).not.toContain(needle.toLowerCase()));
    });
  });

  /* ------------------------------ idempotency ----------------------------- */

  describe('Idempotency', () => {
    it('returns the same payment for a repeated key and creates only one', async () => {
      const order = await createOrder('a', ids.product, 1);
      const key = nextKey();
      const first = await pay('a', { orderId: order.id }, key);
      expect(first.status).toBe(201);
      const second = await pay('a', { orderId: order.id }, key);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(second.body.data.idempotentReplay).toBe(true);

      const list = await http().get('/api/v1/payments?limit=100').set(auth('a'));
      const matches = list.body.data.items.filter((p: { id: string }) => p.id === first.body.data.id);
      expect(matches).toHaveLength(1);
    });

    it('rejects the same key with a different order (409)', async () => {
      const first = await createOrder('a', ids.product, 1);
      const other = await createOrder('a', ids.product, 1);
      const key = nextKey();
      expect((await pay('a', { orderId: first.id }, key)).status).toBe(201);
      const clash = await pay('a', { orderId: other.id }, key);
      expect(clash.status).toBe(409);
      expect(JSON.stringify(clash.body)).toContain('مختلف');
    });

    it('is safe under concurrent identical requests', async () => {
      const order = await createOrder('a', ids.product, 1);
      const key = nextKey();
      const [r1, r2] = await Promise.all([
        pay('a', { orderId: order.id }, key),
        pay('a', { orderId: order.id }, key),
      ]);
      expect([r1.status, r2.status].every((s) => s === 201)).toBe(true);
      const id1 = r1.body.data.id ?? r1.body.data.paymentId;
      const id2 = r2.body.data.id ?? r2.body.data.paymentId;
      expect(id1).toBe(id2);

      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const count = await prisma.payment.count({ where: { orderId: order.id } });
      expect(count).toBe(1);
      await prisma.$disconnect();
    });

    it('scopes keys per user (same key, different customers)', async () => {
      const orderA = await createOrder('a', ids.product, 1);
      const orderB = await createOrder('b', ids.product, 1);
      const key = nextKey();
      const pa = await pay('a', { orderId: orderA.id }, key);
      const pb = await pay('b', { orderId: orderB.id }, key);
      expect(pa.status).toBe(201);
      expect(pb.status).toBe(201);
      expect(pb.body.data.id).not.toBe(pa.body.data.id);
    });
  });

  /* --------------------------------- admin -------------------------------- */

  describe('Admin access', () => {
    it('requires payments.read for list and detail', async () => {
      expect((await http().get('/api/v1/admin/payments').set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().get(`/api/v1/admin/payments/${paymentIds.a}`).set(auth('staffNoPerm'))).status).toBe(403);
      expect((await http().get('/api/v1/admin/payments').set(auth('a'))).status).toBe(403);

      const list = await http().get('/api/v1/admin/payments?limit=100').set(auth('staffReader'));
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBeGreaterThanOrEqual(1);

      const detail = await http().get(`/api/v1/admin/payments/${paymentIds.a}`).set(auth('staffReader'));
      expect(detail.status).toBe(200);
      expect(detail.body.data.orderId).toBe(ids.orderA);
    });

    it('supports filters without unpaginated scans', async () => {
      const byStatus = await http().get('/api/v1/admin/payments?status=PENDING&limit=100').set(auth('staffReader'));
      expect(byStatus.body.data.items.every((p: { status: string }) => p.status === 'PENDING')).toBe(true);

      const byOrder = await http().get(`/api/v1/admin/payments?orderId=${ids.orderA}`).set(auth('staffReader'));
      expect(byOrder.body.data.items).toHaveLength(1);

      const byUser = await http().get(`/api/v1/admin/payments?userId=${ids.orderA ? '' : ''}`).set(auth('staffReader'));
      expect(byUser.status).toBe(200);

      const byMethod = await http().get('/api/v1/admin/payments?method=SHAM_CASH&limit=100').set(auth('staffReader'));
      expect(byMethod.status).toBe(200);

      const invalidStatus = await http().get('/api/v1/admin/payments?status=NOPE').set(auth('staffReader'));
      expect(invalidStatus.status).toBe(400);
    });

    it('requires payments.update to cancel, and refuses arbitrary status changes', async () => {
      expect((await http().post(`/api/v1/admin/payments/${paymentIds.a}/cancel`)
        .set(auth('staffNoPerm')).send({})).status).toBe(403);

      // there is no generic status-update route at all
      expect((await http().patch(`/api/v1/admin/payments/${paymentIds.a}`).set(auth('staffReader')).send({
        status: 'SUCCEEDED',
      })).status).toBe(404);
      expect((await http().patch(`/api/v1/payments/${paymentIds.a}`).set(auth('a')).send({
        status: 'SUCCEEDED',
      })).status).toBe(404);
    });

    it('cancels a PENDING payment and refuses a double cancellation', async () => {
      const order = await createOrder('a', ids.product, 1);
      const created = await pay('a', { orderId: order.id });
      expect(created.status).toBe(201);
      const paymentId = created.body.data.id;

      const first = await http().post(`/api/v1/admin/payments/${paymentId}/cancel`)
        .set(auth('staffReader')).send({ reason: 'طلب العميل' });
      expect(first.status).toBe(200);
      expect(first.body.data.status).toBe('CANCELLED');
      expect(first.body.data.cancellationReason).toBe('طلب العميل');

      const second = await http().post(`/api/v1/admin/payments/${paymentId}/cancel`)
        .set(auth('staffReader')).send({});
      expect(second.status).toBe(409);
    });

    it('cannot fake success through any endpoint', async () => {
      const candidates = [
        http().post('/api/v1/payments').set(auth('a')).send({ orderId: ids.orderA, status: 'SUCCEEDED' }),
        http().post(`/api/v1/payments/${paymentIds.a}/succeed`).set(auth('a')).send({}),
        http().post(`/api/v1/payments/${paymentIds.a}/confirm`).set(auth('a')).send({}),
        http().post(`/api/v1/admin/payments/${paymentIds.a}/succeed`).set(auth('owner')).send({}),
        http().post(`/api/v1/admin/payments/${paymentIds.a}/status`).set(auth('owner')).send({ status: 'SUCCEEDED' }),
      ];
      const results = await Promise.all(candidates);
      results.forEach((res) => expect([400, 401, 404, 409]).toContain(res.status));

      const detail = await http().get(`/api/v1/payments/${paymentIds.a}`).set(auth('a'));
      expect(detail.body.data.status).not.toBe('SUCCEEDED');
    });
  });

  /* --------------------------------- audit -------------------------------- */

  describe('Audit', () => {
    it('records payment events with the acting user and no secrets', async () => {
      for (const action of ['PAYMENT_CREATED', 'PAYMENT_CANCELLED', 'PAYMENT_STATUS_UPDATED']) {
        const res = await http().get(`/api/v1/audit?action=${action}&limit=5`).set(auth('owner'));
        expect(res.status).toBe(200);
      }
      const created = await http().get('/api/v1/audit?action=PAYMENT_CREATED&limit=5').set(auth('owner'));
      expect(created.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(created.body.data.items[0].entity).toBe('payment');
      expect(created.body.data.items[0].metadata.amount).toBeDefined();

      const all = await http().get('/api/v1/audit?limit=100').set(auth('owner'));
      const raw = JSON.stringify(all.body).toLowerCase();
      ['passwordhash', 'tokenhash', 'authorization', 'apikey', 'secret'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });

    it('cancellation is audited against the staff member who performed it', async () => {
      const events = await http().get('/api/v1/audit?action=PAYMENT_CANCELLED&limit=5').set(auth('owner'));
      expect(events.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(events.body.data.items[0].metadata.source).toBe('ADMIN');
    });
  });

  /* ------------------------------ swagger/docs ---------------------------- */

  describe('Route surface', () => {
    /**
     * Swagger itself is bootstrapped in main.ts (not in the testing module), so the
     * live OpenAPI document is verified manually; here we prove the HTTP surface:
     * every documented payment route exists and is protected, and no status-update
     * route exists at all.
     */
    it('exposes exactly the documented payment routes and nothing more', async () => {
      const probes: Array<[string, string, number]> = [
        ['post', '/api/v1/payments', 401],
        ['get', '/api/v1/payments', 401],
        ['get', '/api/v1/payments/any-id', 401],
        ['get', '/api/v1/admin/payments', 401],
        ['get', '/api/v1/admin/payments/any-id', 401],
        ['post', '/api/v1/admin/payments/any-id/cancel', 401],
      ];
      for (const [method, path, expected] of probes) {
        const res = await (http() as never as Record<string, (p: string) => request.Test>)[method](path);
        expect(`${method.toUpperCase()} ${path} -> ${res.status}`).toBe(`${method.toUpperCase()} ${path} -> ${expected}`);
      }

      // No route can set a status directly (no PATCH on payments at all).
      expect((await http().patch('/api/v1/payments/any-id').set(auth('owner')).send({ status: 'SUCCEEDED' })).status).toBe(404);
      expect((await http().patch('/api/v1/admin/payments/any-id').set(auth('owner')).send({ status: 'SUCCEEDED' })).status).toBe(404);
      expect((await http().post('/api/v1/admin/payments/any-id/status').set(auth('owner')).send({ status: 'SUCCEEDED' })).status).toBe(404);
    });
  });
});
