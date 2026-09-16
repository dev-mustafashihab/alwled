import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 10 — Dashboard & Analytics (e2e).
 *
 * Real DB + real guards. Every headline metric is cross-checked against an
 * independent SQL aggregation, so the dashboard never proves itself with itself.
 * A before/after snapshot proves the whole surface is read-only.
 */
describe('Dashboard & Analytics (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;
  let prisma: PrismaClient;
  let openApi: { paths: Record<string, any> };

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const tokens: Record<string, string> = {};
  const ids: Record<string, any> = {};
  const phones: Record<string, string> = {
    customer: `0341${stamp}`, staffNoPerm: `0342${stamp}`, staffDash: `0343${stamp}`,
    staffAdmin: `0344${stamp}`, fixtureOwner: `0345${stamp}`,
  };
  const emails: Record<string, string> = Object.fromEntries(
    Object.entries(phones).map(([who]) => [who, `dash.${who}.${stamp}@alwled.test`]),
  );

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const fixtureUsers: string[] = [];
  const fixtureVerifications: string[] = [];

  const inRange = new Date('2026-09-10T10:00:00.000Z');
  const outOfRange = new Date('2020-01-05T10:00:00.000Z');
  const RANGE_FROM = new Date('2026-09-01T00:00:00.000Z');
  const RANGE_TO = new Date('2026-09-16T00:00:00.000Z');
  const RANGE = `from=${RANGE_FROM.toISOString()}&to=${RANGE_TO.toISOString()}`;

  /** Independent expectation, computed by SQL — not by the dashboard code. */
  const sql = async <T = any>(query: Prisma.Sql): Promise<T[]> => prisma.$queryRaw<T[]>(query);

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

    // staff roles: one with dashboard.read only, one with no permissions, plus ADMIN
    const dashboardRead = await prisma.permission.findUnique({
      where: { key: 'dashboard.read' }, select: { id: true },
    });
    expect(typeof dashboardRead?.id).toBe('number');

    await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `DASHONLY_${stamp}`, description: 'dashboard.read فقط',
      permissionIds: [dashboardRead?.id],
    });
    await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `DASHNONE_${stamp}`, description: 'بدون صلاحيات',
    });

    for (const [who, roleName, isCustomer] of [
      ['customer', null, true],
      ['staffNoPerm', `DASHNONE_${stamp}`, false],
      ['staffDash', `DASHONLY_${stamp}`, false],
      ['staffAdmin', 'ADMIN', false],
    ] as [string, string | null, boolean][]) {
      if (isCustomer) {
        await http().post('/api/v1/auth/register').send({
          firstName: 'Dash', lastName: `C${stamp}`, email: emails[who], phone: phones[who],
          password: pass, confirmPassword: pass,
        });
      } else {
        const created = await http().post('/api/v1/employees').set(auth('owner')).send({
          firstName: 'Dash', lastName: who, email: emails[who], phone: phones[who],
          password: pass, roleName,
        });
        expect(created.status).toBe(201);
      }
      const login = await http().post('/api/v1/auth/login').send({ phone: phones[who], password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      ids[who] = me.body.data.id;
    }

    /* ------------------------------ fixtures ------------------------------- */
    const category = await prisma.category.create({
      data: { name: `DashCat ${stamp}`, slug: `dash-cat-${stamp}` },
    });
    const brand = await prisma.brand.create({ data: { name: `DashBrand ${stamp}`, slug: `dash-brand-${stamp}` } });
    ids.category = category.id;
    ids.brand = brand.id;

    const inventorySpecs = [
      { quantity: 10, reserved: 2, threshold: 5, active: true },   // available 8
      { quantity: 5, reserved: 4, threshold: 5, active: true },    // available 1  → low
      { quantity: 3, reserved: 3, threshold: 5, active: true },    // available 0  → low + out
      { quantity: 50, reserved: 0, threshold: 5, active: true },   // available 50
      { quantity: 1, reserved: 0, threshold: 5, active: false },   // available 1  → low
    ];
    ids.products = [];
    for (const [index, spec] of inventorySpecs.entries()) {
      const product = await prisma.product.create({
        data: {
          name: `DashProduct ${stamp}-${index}`, slug: `dash-product-${stamp}-${index}`,
          sku: `DASH-${stamp}-${index}`, price: new Prisma.Decimal('100.00'),
          categoryId: category.id, brandId: brand.id, isActive: spec.active,
          images: index === 0 ? { create: [{ url: 'https://cdn.test/a.png', isPrimary: true }] } : undefined,
          inventory: {
            create: {
              quantity: spec.quantity, reservedQuantity: spec.reserved, lowStockThreshold: spec.threshold,
            },
          },
        },
      });
      ids.products.push(product.id);
    }

    // orders + payments: known money values, one deliberately outside the range
    const orderSpecs = [
      { total: '399.98', status: 'PENDING', createdAt: inRange, payment: { status: 'PENDING', amount: '399.98' } },
      { total: '0.01', status: 'CONFIRMED', createdAt: inRange, payment: { status: 'SUCCEEDED', amount: '0.01', reviewed: true } },
      { total: '100.10', status: 'CONFIRMED', createdAt: inRange, payment: { status: 'PENDING_REVIEW', amount: '100.10', submitted: true } },
      { total: '999999.99', status: 'CANCELLED', createdAt: inRange, payment: { status: 'CANCELLED', amount: '999999.99' } },
      { total: '55.55', status: 'PENDING', createdAt: outOfRange, payment: { status: 'FAILED', amount: '55.55', reviewed: true } },
    ];
    ids.orders = [];
    ids.payments = [];
    for (const [index, spec] of orderSpecs.entries()) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-DASH-${stamp}-${index}`,
          userId: ids.customer as string,
          status: spec.status as never,
          subtotal: new Prisma.Decimal(spec.total),
          total: new Prisma.Decimal(spec.total),
          createdAt: spec.createdAt,
        },
      });
      ids.orders.push(order.id);
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          userId: ids.customer as string,
          method: 'SHAM_CASH',
          status: spec.payment.status as never,
          amount: new Prisma.Decimal(spec.payment.amount),
          transactionReference: `SC-DASH-${stamp}-${index}`,
          createdAt: spec.createdAt,
          proofUrl: spec.payment.submitted || spec.payment.reviewed ? 'https://internal.storage/proof.png' : null,
          submittedAt: spec.payment.submitted || spec.payment.reviewed ? inRange : null,
          reviewedAt: spec.payment.reviewed ? inRange : null,
          reviewedBy: spec.payment.reviewed ? ids.staffAdmin : null,
        },
      });
      ids.payments.push(payment.id);
    }

    // verification fixtures: one row per status (active ones need distinct users)
    const verificationSpecs = ['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
    for (const [index, status] of verificationSpecs.entries()) {
      const user = await prisma.user.create({
        data: {
          firstName: 'DashFix', lastName: `V${index}`, phone: `078${index}${stamp}`,
          email: `dash.fx${index}.${stamp}@alwled.test`, passwordHash: 'fixture-only',
          status: 'ACTIVE', createdAt: inRange,
        },
      });
      fixtureUsers.push(user.id);
      const verification = await prisma.customerVerification.create({
        data: {
          userId: user.id, status: status as never, provider: 'LOG', attempt: 1,
          createdAt: inRange, startedAt: inRange,
          completedAt: ['VERIFIED', 'REJECTED', 'CANCELLED'].includes(status) ? inRange : null,
          rejectionReason: status === 'REJECTED' ? 'fixture' : null,
        },
      });
      fixtureVerifications.push(verification.id);
    }
  }, 240000);

  afterAll(async () => {
    try {
      await prisma.idempotencyKey.deleteMany({ where: { paymentId: { in: ids.payments } } });
      await prisma.payment.deleteMany({ where: { id: { in: ids.payments } } });
      await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
      await prisma.customerVerification.deleteMany({ where: { id: { in: fixtureVerifications } } });
      await prisma.user.deleteMany({ where: { id: { in: fixtureUsers } } });
      await prisma.inventory.deleteMany({ where: { productId: { in: ids.products } } });
      await prisma.product.deleteMany({ where: { id: { in: ids.products } } });
      await prisma.category.deleteMany({ where: { id: ids.category } });
      await prisma.brand.deleteMany({ where: { id: ids.brand } });
      const tests = await prisma.user.findMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
        select: { id: true },
      });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: tests.map((u) => u.id) } } });
      await prisma.payment.deleteMany({ where: { userId: { in: tests.map((u) => u.id) } } });
      await prisma.order.deleteMany({ where: { userId: { in: tests.map((u) => u.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: tests.map((u) => u.id) } } });
      await prisma.role.deleteMany({ where: { name: { in: [`DASHONLY_${stamp}`, `DASHNONE_${stamp}`] } } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ------------------------------- auth ---------------------------------- */

  describe('Authentication & permissions', () => {
    const routes = [
      'overview', 'catalog', 'orders', 'payments', 'inventory', 'verifications',
      'recent-orders', 'recent-payments', 'payment-review',
    ];

    it('requires a token on every dashboard route', async () => {
      for (const route of [...routes, ...['timeseries'].map((r) => r)]) {
        const path = route === 'timeseries' ? '/api/v1/admin/analytics/timeseries' : `/api/v1/admin/dashboard/${route}`;
        const res = await http().get(path);
        expect(`${path}:${res.status}`).toBe(`${path}:401`);
      }
    });

    it('rejects an invalid token', async () => {
      const res = await http().get('/api/v1/admin/dashboard/overview').set({ Authorization: 'Bearer nope' });
      expect(res.status).toBe(401);
    });

    it('denies customers and unprivileged staff', async () => {
      for (const who of ['customer', 'staffNoPerm']) {
        for (const route of routes) {
          const res = await http().get(`/api/v1/admin/dashboard/${route}`).set(auth(who));
          expect(`${who}/${route}:${res.status}`).toBe(`${who}/${route}:403`);
        }
        const analytics = await http().get('/api/v1/admin/analytics/timeseries').set(auth(who));
        expect(`${who}/analytics:${analytics.status}`).toBe(`${who}/analytics:403`);
      }
    });

    it('allows dashboard.read without granting analytics.read', async () => {
      expect((await http().get('/api/v1/admin/dashboard/overview').set(auth('staffDash'))).status).toBe(200);
      // aggregating series is a separate permission
      expect((await http().get('/api/v1/admin/analytics/timeseries').set(auth('staffDash'))).status).toBe(403);
    });

    it('allows owner and admin everywhere', async () => {
      for (const who of ['owner', 'staffAdmin']) {
        expect((await http().get('/api/v1/admin/dashboard/overview').set(auth(who))).status).toBe(200);
        expect((await http().get('/api/v1/admin/analytics/timeseries').set(auth(who))).status).toBe(200);
      }
    });

    it('exposes no write verb on the dashboard surface', async () => {
      for (const route of routes) {
        for (const verb of ['post', 'put', 'patch', 'delete']) {
          const res = await (http() as any)[verb](`/api/v1/admin/dashboard/${route}`).set(auth('owner')).send({});
          expect(`${verb} ${route}: ${res.status === 404 || res.status === 405}`).toBe(`${verb} ${route}: true`);
        }
      }
    });

    it('publishes every dashboard route in OpenAPI', async () => {
      const paths = Object.keys(openApi.paths);
      for (const path of [
        '/api/v1/admin/dashboard/overview', '/api/v1/admin/dashboard/catalog',
        '/api/v1/admin/dashboard/orders', '/api/v1/admin/dashboard/payments',
        '/api/v1/admin/dashboard/inventory', '/api/v1/admin/dashboard/verifications',
        '/api/v1/admin/dashboard/recent-orders', '/api/v1/admin/dashboard/recent-payments',
        '/api/v1/admin/dashboard/payment-review', '/api/v1/admin/analytics/timeseries',
      ]) {
        expect(`${path}:${paths.includes(path)}`).toBe(`${path}:true`);
      }
      // documented as GET only
      for (const path of paths.filter((p) => p.includes('/admin/dashboard') || p.includes('/admin/analytics'))) {
        expect(`${path}:${Object.keys(openApi.paths[path]).join(',')}`).toBe(`${path}:get`);
      }
    });
  });

  /* ------------------------------ overview ------------------------------- */

  describe('Overview', () => {
    it('matches independent SQL counts', async () => {
      const res = await http().get('/api/v1/admin/dashboard/overview').set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;

      const [users] = await sql<{ total: bigint; active: bigint }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active
        FROM users`);
      const [orders] = await sql<{ total: bigint; pending: bigint; confirmed: bigint; cancelled: bigint }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE status = 'PENDING')::bigint AS pending,
               COUNT(*) FILTER (WHERE status = 'CONFIRMED')::bigint AS confirmed,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')::bigint AS cancelled
        FROM orders`);
      const [payments] = await sql<{ succeeded: bigint; succeeded_amount: string; pending_review: bigint }>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::bigint AS succeeded,
               COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCEEDED'), 0)::text AS succeeded_amount,
               COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::bigint AS pending_review
        FROM payments`);
      const [inventory] = await sql<{ qty: number; reserved: number }>(Prisma.sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS qty, COALESCE(SUM(reserved_quantity), 0)::int AS reserved
        FROM inventory`);
      const [products] = await sql<{ total: bigint; active: bigint }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE is_active)::bigint AS active FROM products`);

      expect(data.users.total).toBe(Number(users.total));
      expect(data.users.active).toBe(Number(users.active));
      expect(data.orders.total).toBe(Number(orders.total));
      expect(data.orders.pending).toBe(Number(orders.pending));
      expect(data.orders.confirmed).toBe(Number(orders.confirmed));
      expect(data.orders.cancelled).toBe(Number(orders.cancelled));
      expect(data.payments.succeeded).toBe(Number(payments.succeeded));
      expect(data.payments.succeededAmount).toBe(Number(payments.succeeded_amount).toFixed(2));
      expect(data.payments.pendingReview).toBe(Number(payments.pending_review));
      expect(data.products.total).toBe(Number(products.total));
      expect(data.products.active).toBe(Number(products.active));
      expect(data.inventory.totalQuantity).toBe(inventory.qty);
      expect(data.inventory.totalReserved).toBe(inventory.reserved);
      // the formula is enforced, not assumed
      expect(data.inventory.available).toBe(inventory.qty - inventory.reserved);
      const [roles] = await sql<{ customers: bigint; staff: bigint }>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND r.name = 'CUSTOMER'))::bigint AS customers,
               COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND r.name <> 'CUSTOMER'))::bigint AS staff
        FROM users u`);
      expect(data.users.customers).toBe(Number(roles.customers));
      expect(data.users.staff).toBe(Number(roles.staff));
      expect(data.generatedAt).toBeTruthy();
    });

    it('never reports pending money as collected', async () => {
      const res = await http().get('/api/v1/admin/dashboard/overview').set(auth('owner'));
      const [row] = await sql<{ succeeded: string; pending: string; review: string }>(Prisma.sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCEEDED'), 0)::text  AS succeeded,
               COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::text    AS pending,
               COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING_REVIEW'), 0)::text AS review
        FROM payments`);
      expect(res.body.data.payments.succeededAmount).toBe(Number(row.succeeded).toFixed(2));
      expect(res.body.data.payments.succeededAmount).not.toBe(Number(row.pending).toFixed(2));
      expect(Number(res.body.data.payments.pendingAmount)).toBeGreaterThanOrEqual(Number(row.review));
      expect(res.body.data.payments.succeededAmount).not.toContain('e');
    });
  });

  /* --------------------------- orders analytics --------------------------- */

  describe('Orders analytics', () => {
    it('groups by status and totals money from the database', async () => {
      const res = await http().get(`/api/v1/admin/dashboard/orders?${RANGE}`).set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;

      const [expected] = await sql<{ n: bigint; sum: string; avg: string }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS n, COALESCE(SUM(total), 0)::text AS sum,
               COALESCE(AVG(total), 0)::text AS avg
        FROM orders WHERE created_at >= ${RANGE_FROM}::timestamp AND created_at < ${RANGE_TO}::timestamp`);
      expect(data.total).toBe(Number(expected.n));
      expect(data.totalValue).toBe(Number(expected.sum).toFixed(2));
      expect(data.averageOrderValue).toBe(Number(expected.avg).toFixed(2));
      expect(typeof data.range.from).toBe('string');
      expect(data.range.boundary).toBe('from inclusive / to exclusive');

      const groups = Object.fromEntries(data.byStatus.map((r: any) => [r.status, r.count]));
      const [sqlGroups] = await sql<{ pending: bigint; confirmed: bigint; cancelled: bigint }>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::bigint AS pending,
               COUNT(*) FILTER (WHERE status = 'CONFIRMED')::bigint AS confirmed,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')::bigint AS cancelled
        FROM orders WHERE created_at >= ${RANGE_FROM}::timestamp AND created_at < ${RANGE_TO}::timestamp`);
      expect(groups.PENDING).toBe(Number(sqlGroups.pending));
      expect(groups.CONFIRMED).toBe(Number(sqlGroups.confirmed));
      expect(groups.CANCELLED).toBe(Number(sqlGroups.cancelled));
    });

    it('honours from inclusive / to exclusive at the exact boundary', async () => {
      const from = '2026-09-10T10:00:00.000Z';
      const to = '2026-09-10T10:00:00.001Z';
      const inside = await http().get(`/api/v1/admin/dashboard/orders?from=${from}&to=${to}`).set(auth('owner'));
      expect(inside.body.data.total).toBeGreaterThanOrEqual(1);
      const boundary = await http()
        .get(`/api/v1/admin/dashboard/orders?from=${to}&to=2026-09-10T11:00:00.000Z`).set(auth('owner'));
      expect(boundary.body.data.total).toBe(0);
      const old = await http()
        .get('/api/v1/admin/dashboard/orders?from=2020-01-01T00:00:00.000Z&to=2020-01-10T00:00:00.000Z').set(auth('owner'));
      expect(old.body.data.total).toBe(1);
      expect(old.body.data.totalValue).toBe('55.55');
    });

    it('returns zeros for an empty window instead of guessing', async () => {
      const res = await http()
        .get('/api/v1/admin/dashboard/orders?from=2019-01-01T00:00:00.000Z&to=2019-01-02T00:00:00.000Z').set(auth('owner'));
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.totalValue).toBe('0.00');
      expect(res.body.data.averageOrderValue).toBe('0.00');
      expect(res.body.data.byStatus).toEqual([]);
    });

    it('validates the range and the filters', async () => {
      expect((await http().get('/api/v1/admin/dashboard/orders?from=2026-09-10T00:00:00.000Z&to=2026-09-01T00:00:00.000Z').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/orders?from=not-a-date').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/orders?from=2000-01-01T00:00:00.000Z').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/orders?status=BOGUS').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/orders?sortBy=passwordHash').set(auth('owner'))).status).toBe(400);
      const filtered = await http().get(`/api/v1/admin/dashboard/orders?status=CONFIRMED&${RANGE}`).set(auth('owner'));
      expect(filtered.body.data.byStatus.every((r: any) => r.status === 'CONFIRMED')).toBe(true);
    });
  });

  /* -------------------------- payments analytics -------------------------- */

  describe('Payments analytics', () => {
    it('counts SUCCEEDED as the only collected money', async () => {
      const res = await http().get(`/api/v1/admin/dashboard/payments?${RANGE}`).set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;

      const [expected] = await sql<{ succeeded: string; pending: string; review: string }>(Prisma.sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCEEDED'), 0)::text AS succeeded,
               COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::text AS pending,
               COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING_REVIEW'), 0)::text AS review
        FROM payments WHERE created_at >= ${RANGE_FROM}::timestamp AND created_at < ${RANGE_TO}::timestamp`);
      expect(data.succeededAmount).toBe(Number(expected.succeeded).toFixed(2));
      expect(data.pendingAmount).toBe(Number(expected.pending).toFixed(2));
      expect(data.pendingReviewAmount).toBe(Number(expected.review).toFixed(2));
      // the fixture's SUCCEEDED payment is exactly 0.01 — no float rounding anywhere
      expect(data.succeededAmount).toBe('0.01');
      expect(data.byStatus.find((r: any) => r.status === 'SUCCEEDED').amount).toBe('0.01');
      expect(data.succeededAmount).not.toContain('399.98');
    });

    it('describes Sham Cash as a manual employee decision, never provider verification', async () => {
      const res = await http().get(`/api/v1/admin/dashboard/payments?${RANGE}`).set(auth('owner'));
      const sham = res.body.data.shamCash;
      expect(sham.note).toContain('يدوي');
      expect(sham.manuallyConfirmedCount).toBeGreaterThanOrEqual(1);
      expect(sham.awaitingReviewCount).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(sham).toLowerCase()).not.toContain('verified by provider');
    });

    it('validates filters and rejects an absurd range', async () => {
      expect((await http().get('/api/v1/admin/dashboard/payments?status=NOPE').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/payments?method=CARD').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/payments?from=2015-01-01T00:00:00.000Z').set(auth('owner'))).status).toBe(400);
    });
  });

  /* ------------------------- inventory analytics -------------------------- */

  describe('Inventory analytics', () => {
    it('uses available = quantity - reservedQuantity and each row\'s threshold', async () => {
      const res = await http().get('/api/v1/admin/dashboard/inventory').set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;

      const [totals] = await sql<{ qty: number; reserved: number; rows: bigint }>(Prisma.sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS qty, COALESCE(SUM(reserved_quantity), 0)::int AS reserved,
               COUNT(*)::bigint AS rows FROM inventory`);
      const [low] = await sql<{ lo: bigint; out: bigint }>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE (quantity - reserved_quantity) <= low_stock_threshold)::bigint AS lo,
               COUNT(*) FILTER (WHERE (quantity - reserved_quantity) <= 0)::bigint AS out
        FROM inventory`);

      expect(data.totalQuantity).toBe(totals.qty);
      expect(data.totalReserved).toBe(totals.reserved);
      expect(data.available).toBe(totals.qty - totals.reserved);
      expect(data.trackedProducts).toBe(Number(totals.rows));
      expect(data.lowStock).toBe(Number(low.lo));
      expect(data.outOfStock).toBe(Number(low.out));
      expect(data.lowStock).toBeGreaterThanOrEqual(3); // fixtures guarantee both buckets
      expect(data.outOfStock).toBeGreaterThanOrEqual(1);
      expect(data.definitions.available).toBe('quantity - reservedQuantity');

      for (const item of data.lowStockProducts) {
        expect(item.available).toBe(item.quantity - item.reserved);
        expect(item.available).toBeLessThanOrEqual(item.threshold);
      }
      expect(data.lowStockProducts.length).toBeLessThanOrEqual(10);
    });

    it('includes a movement summary only when asked', async () => {
      const without = await http().get('/api/v1/admin/dashboard/inventory').set(auth('owner'));
      expect(without.body.data.movements).toBeUndefined();
      const withMovements = await http().get('/api/v1/admin/dashboard/inventory?includeMovements=true').set(auth('owner'));
      expect(Array.isArray(withMovements.body.data.movements)).toBe(true);
    });
  });

  /* ----------------------- verification analytics ------------------------- */

  describe('Verification analytics', () => {
    it('counts every status and reports the review queue', async () => {
      const res = await http().get(`/api/v1/admin/dashboard/verifications?${RANGE}`).set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;

      const [expected] = await sql<{ total: bigint; in_review: bigint; verified: bigint; rejected: bigint }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::bigint AS in_review,
               COUNT(*) FILTER (WHERE status = 'VERIFIED')::bigint AS verified,
               COUNT(*) FILTER (WHERE status = 'REJECTED')::bigint AS rejected
        FROM customer_verifications
        WHERE created_at >= ${RANGE_FROM}::timestamp AND created_at < ${RANGE_TO}::timestamp`);

      expect(data.total).toBe(Number(expected.total));
      expect(data.inReview).toBe(Number(expected.in_review));
      expect(data.verified).toBe(Number(expected.verified));
      expect(data.rejected).toBe(Number(expected.rejected));
      expect(data.inReview).toBeGreaterThanOrEqual(1); // fixture IN_REVIEW is in the queue
      expect(data.note).toContain('مستقل');
      const statuses = Object.fromEntries(data.byStatus.map((r: any) => [r.status, r.count]));
      for (const status of ['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
        expect(`${status}:${statuses[status] >= 1}`).toBe(`${status}:true`);
      }
    });
  });

  /* ------------------------------ timeseries ------------------------------ */

  describe('Time series', () => {
    it('returns a continuous daily series with zero-filled gaps', async () => {
      const res = await http()
        .get('/api/v1/admin/analytics/timeseries?from=2026-09-08T00:00:00.000Z&to=2026-09-12T00:00:00.000Z&granularity=day')
        .set(auth('staffAdmin'));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.series.map((p: any) => p.date)).toEqual([
        '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
      ]);
      expect(data.granularity).toBe('day');
      const day = data.series.find((p: any) => p.date === '2026-09-10');
      expect(day.orders).toBeGreaterThanOrEqual(4);
      expect(day.orderValue).toBe('1000500.08'); // 399.98 + 0.01 + 100.10 + 999999.99, exact
      expect(day.succeededPayments).toBeGreaterThanOrEqual(1);
      expect(day.succeededPaymentAmount).toBe('0.01');
      // order value and payment value are never conflated
      expect(day.orderValue).not.toBe(day.succeededPaymentAmount);
      // no float artifacts anywhere in the payload
      expect(JSON.stringify(data)).not.toMatch(/\d\.\d{6,}/);
      const empty = data.series.find((p: any) => p.date === '2026-09-08');
      expect(empty).toMatchObject({ orders: 0, orderValue: '0.00', succeededPaymentAmount: '0.00' });
    });

    it('supports weekly and monthly grouping and validates input', async () => {
      const weekly = await http()
        .get('/api/v1/admin/analytics/timeseries?from=2026-09-07T00:00:00.000Z&to=2026-09-21T00:00:00.000Z&granularity=week')
        .set(auth('staffAdmin'));
      expect(weekly.status).toBe(200);
      expect(weekly.body.data.series.map((p: any) => p.date)).toEqual(['2026-09-07', '2026-09-14']);
      const monthly = await http()
        .get('/api/v1/admin/analytics/timeseries?from=2026-08-10T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&granularity=month')
        .set(auth('staffAdmin'));
      expect(monthly.body.data.series.map((p: any) => p.date)).toEqual(['2026-08-01', '2026-09-01']);
      expect((await http().get('/api/v1/admin/analytics/timeseries?granularity=hour').set(auth('staffAdmin'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/analytics/timeseries?sortBy=createdAt').set(auth('staffAdmin'))).status).toBe(400);
    });

    it('defaults to the last 30 days when no range is given', async () => {
      const res = await http().get('/api/v1/admin/analytics/timeseries').set(auth('staffAdmin'));
      expect(res.status).toBe(200);
      expect(res.body.data.range.days).toBe(30);
      expect(res.body.data.series).toHaveLength(30);
      expect(res.body.data.range.timezone).toBe('UTC');
    });
  });

  /* -------------------------- lists & review queue ------------------------ */

  describe('Bounded lists', () => {
    it('paginates recent orders and never allows an unbounded limit', async () => {
      const first = await http().get('/api/v1/admin/dashboard/recent-orders?limit=1&page=1').set(auth('owner'));
      expect(first.status).toBe(200);
      expect(first.body.data.items).toHaveLength(1);
      expect(first.body.data.meta).toMatchObject({ page: 1, limit: 1 });
      expect(first.body.data.meta.total).toBeGreaterThanOrEqual(1);
      const second = await http().get('/api/v1/admin/dashboard/recent-orders?limit=1&page=2').set(auth('owner'));
      expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
      expect((await http().get('/api/v1/admin/dashboard/recent-orders?limit=51').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/recent-orders?limit=1000000').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/recent-orders?page=0').set(auth('owner'))).status).toBe(400);
      const item = first.body.data.items[0];
      expect(Object.keys(item).sort()).toEqual(
        ['createdAt', 'currency', 'customerName', 'id', 'itemCount', 'orderNumber', 'status', 'total'].sort(),
      );
      expect(item.total).toMatch(/^\d+\.\d{2}$/);
    });

    it('lists recent payments with whitelisted sorting only', async () => {
      const res = await http().get('/api/v1/admin/dashboard/recent-payments?sortBy=amount&sortOrder=desc').set(auth('owner'));
      expect(res.status).toBe(200);
      expect((await http().get('/api/v1/admin/dashboard/recent-payments?sortBy=id;DROP').set(auth('owner'))).status).toBe(400);
      expect((await http().get('/api/v1/admin/dashboard/recent-payments?status=NOPE').set(auth('owner'))).status).toBe(400);
      const item = res.body.data.items[0];
      expect(item.amount).toMatch(/^\d+\.\d{2}$/);
      expect(item).not.toHaveProperty('proofUrl');
      expect(item).not.toHaveProperty('providerPaymentId');
    });

    it('payment review queue contains PENDING_REVIEW only, without exposing the proof location', async () => {
      const res = await http().get('/api/v1/admin/dashboard/payment-review').set(auth('owner'));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.awaitingReviewTotal).toBeGreaterThanOrEqual(1);
      for (const item of data.items) {
        expect(item.proofAttached).toBe(true);
        expect(item).not.toHaveProperty('proofUrl');
        expect(item.transactionReference).toBeTruthy();
        expect(item.submittedAt).toBeTruthy();
      }
      const [expected] = await sql<{ n: bigint }>(Prisma.sql`
        SELECT COUNT(*)::bigint AS n FROM payments WHERE status = 'PENDING_REVIEW'`);
      expect(data.awaitingReviewTotal).toBe(Number(expected.n));
      expect(JSON.stringify(data)).not.toContain('internal.storage');
    });
  });

  /* ----------------------------- read-only -------------------------------- */

  describe('Read-only guarantee', () => {
    const snapshot = async () => {
      const [row] = await sql<Record<string, string>>(Prisma.sql`
        SELECT (SELECT COUNT(*) FROM orders)::text AS orders,
               (SELECT COUNT(*) FROM payments)::text AS payments,
               (SELECT COUNT(*) FROM users)::text AS users,
               (SELECT COUNT(*) FROM products)::text AS products,
               (SELECT COUNT(*) FROM inventory)::text AS inventory,
               (SELECT COALESCE(SUM(quantity),0) FROM inventory)::text AS inv_qty,
               (SELECT COALESCE(SUM(reserved_quantity),0) FROM inventory)::text AS inv_reserved,
               (SELECT COUNT(*) FROM customer_verifications)::text AS verifications,
               (SELECT COUNT(*) FROM carts)::text AS carts,
               (SELECT COUNT(*) FROM audit_logs)::text AS audit`);
      return row;
    };

    it('leaves every domain table untouched, and writes no audit noise', async () => {
      const before = await snapshot();
      const calls = [
        '/api/v1/admin/dashboard/overview', '/api/v1/admin/dashboard/catalog',
        `/api/v1/admin/dashboard/orders?${RANGE}`, `/api/v1/admin/dashboard/payments?${RANGE}`,
        '/api/v1/admin/dashboard/inventory?includeMovements=true',
        `/api/v1/admin/dashboard/verifications?${RANGE}`,
        '/api/v1/admin/dashboard/recent-orders', '/api/v1/admin/dashboard/recent-payments',
        '/api/v1/admin/dashboard/payment-review',
        '/api/v1/admin/analytics/timeseries?granularity=week',
      ];
      for (const path of calls) {
        const res = await http().get(path).set(auth('owner'));
        expect(`${path}:${res.status}`).toBe(`${path}:200`);
      }
      const after = await snapshot();
      expect(after).toEqual(before);
    });

    it('survives concurrent reads without mutating anything', async () => {
      const before = await snapshot();
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => http().get('/api/v1/admin/dashboard/overview').set(auth('owner'))),
      );
      for (const res of responses) expect(res.status).toBe(200);
      const values = responses.map((r) => r.body.data.orders.total);
      expect(new Set(values).size).toBe(1); // deterministic under concurrency
      expect(await snapshot()).toEqual(before);
    });
  });

  /* ------------------------------ security -------------------------------- */

  describe('Data leakage', () => {
    it('never returns secrets, hashes, tokens or storage locations', async () => {
      const paths = [
        '/api/v1/admin/dashboard/overview', '/api/v1/admin/dashboard/catalog',
        `/api/v1/admin/dashboard/orders?${RANGE}`, `/api/v1/admin/dashboard/payments?${RANGE}`,
        '/api/v1/admin/dashboard/inventory', `/api/v1/admin/dashboard/verifications?${RANGE}`,
        '/api/v1/admin/dashboard/recent-orders', '/api/v1/admin/dashboard/recent-payments',
        '/api/v1/admin/dashboard/payment-review', '/api/v1/admin/analytics/timeseries',
      ];
      for (const path of paths) {
        const res = await http().get(path).set(auth('owner'));
        const blob = JSON.stringify(res.body);
        for (const forbidden of [
          'passwordHash', 'password_hash', 'refreshToken', 'tokenHash', 'verificationToken',
          'apiKey', 'api_key', 'secret', 'authorization', 'proofUrl', 'providerPaymentId',
          'storageKey', 'internal.storage', 'postgres://', 'DATABASE_URL',
        ]) {
          expect(`${path} ~ ${forbidden}:${blob.includes(forbidden)}`).toBe(`${path} ~ ${forbidden}:false`);
        }
      }
    });

    it('cannot be tricked into SQL injection through filters', async () => {
      const payloads = [
        "'; DROP TABLE orders; --", '1 OR 1=1', 'createdAt); DELETE FROM payments; --', '2026-09-01T00:00:00.000Z\' OR \'1\'=\'1',
      ];
      for (const payload of payloads) {
        const query = `status=${encodeURIComponent(payload)}&sortBy=${encodeURIComponent(payload)}`;
        const res = await http().get(`/api/v1/admin/dashboard/orders?${query}`).set(auth('owner'));
        expect(['400', '200'].includes(String(res.status))).toBe(true);
      }
      const [still] = await sql<{ n: bigint }>(Prisma.sql`SELECT COUNT(*)::bigint AS n FROM orders`);
      expect(Number(still.n)).toBeGreaterThanOrEqual(5);
    });
  });
});
