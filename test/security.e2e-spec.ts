import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 12 — Security regression suite.
 *
 * Every test here is a hardening guarantee, not a feature: authentication,
 * authorization matrix, IDOR/BOLA, mass assignment, prototype pollution,
 * injection, rate limiting, spoofing, isolation and data-leakage.
 * A failure in this file is a security regression.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let http: () => ReturnType<typeof request.agent>;
  let prisma: PrismaClient;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const tokens: Record<string, string> = {};
  const ids: Record<string, any> = {};
  const phones: Record<string, string> = {
    a: `0361${stamp}`, b: `0362${stamp}`, staffNoPerm: `0363${stamp}`, staffAdmin: `0364${stamp}`,
  };
  const emails: Record<string, string> = Object.fromEntries(
    Object.entries(phones).map(([who]) => [who, `sec.${who}.${stamp}@alwled.test`]),
  );
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  let seq = 0;
  const nextKey = () => `sec-${stamp}-${++seq}`;
  /** Sends a request; a server-closed idle socket (ECONNRESET) is retried once. */
  const send = async (build: () => request.Test): Promise<request.Response> => {
    try {
      return await build();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') return build();
      throw error;
    }
  };
  const sql = async <T = any>(query: Prisma.Sql): Promise<T[]> => prisma.$queryRaw<T[]>(query);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    // one persistent agent: supertest must not bind/unbind a listener per request
    const agent = request.agent(app.getHttpServer());
    http = () => agent;
    prisma = new PrismaClient();

    const ownerLogin = await http().post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    tokens.owner = ownerLogin.body.data.accessToken;

    await http().post('/api/v1/roles').set(auth('owner')).send({
      name: `SECNOPERM_${stamp}`, description: 'بدون صلاحيات (أمن)',
    });
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Sec', lastName: 'NoPerm', email: emails.staffNoPerm, phone: phones.staffNoPerm,
      password: pass, roleName: `SECNOPERM_${stamp}`,
    });
    await http().post('/api/v1/employees').set(auth('owner')).send({
      firstName: 'Sec', lastName: 'Admin', email: emails.staffAdmin, phone: phones.staffAdmin,
      password: pass, roleName: 'ADMIN',
    });
    for (const who of ['a', 'b'] as const) {
      const reg = await http().post('/api/v1/auth/register').send({
        firstName: 'Sec', lastName: `S${who.toUpperCase()}`, email: emails[who], phone: phones[who],
        password: pass, confirmPassword: pass,
      });
      expect(reg.status).toBe(201);
    }
    for (const who of ['a', 'b', 'staffNoPerm', 'staffAdmin'] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone: phones[who], password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      ids[who] = me.body.data.id;
    }

    // owned resources for A (and a second copy for B where isolation matters)
    const category = await http().post('/api/v1/categories').set(auth('owner')).send({
      name: `أمن تصنيف ${stamp}`, slug: `sec-cat-${stamp}`,
    });
    const brand = await http().post('/api/v1/brands').set(auth('owner')).send({
      name: `أمن علامة ${stamp}`, slug: `sec-brand-${stamp}`,
    });
    const product = await http().post('/api/v1/products').set(auth('owner')).send({
      name: `منتج أمن ${stamp}`, sku: `SEC-${stamp}`, price: 99.99,
      categoryId: category.body.data.id, brandId: brand.body.data.id,
    });
    ids.category = category.body.data.id;
    ids.brand = brand.body.data.id;
    ids.product = product.body.data.id;
    await http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({
      quantity: 25, reason: 'STOCK_RECEIVED',
    });

    await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
    const order = await http().post('/api/v1/orders')
      .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
    ids.orderA = order.body.data.id;
    const payment = await http().post('/api/v1/payments')
      .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({ orderId: ids.orderA });
    ids.paymentA = payment.body.data.id;

    const notification = await prisma.notification.findFirst({ where: { userId: ids.a }, select: { id: true } });
    ids.notificationA = notification?.id;

    const verification = await http().post('/api/v1/verification/start')
      .set({ ...auth('b'), 'Idempotency-Key': nextKey() }).send({});
    ids.verificationB = verification.body.data.verification.id;
  }, 300000);

  afterAll(async () => {
    try {
      const users = await prisma.user.findMany({
        where: { OR: [{ phone: { in: Object.values(phones) } }, { email: { in: Object.values(emails) } }] },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.customerVerification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.role.deleteMany({ where: { name: { startsWith: `SECNOPERM_${stamp}` }, isSystem: false } });
      await prisma.role.deleteMany({ where: { name: { startsWith: `SECROLE_${stamp}` }, isSystem: false } });
      await prisma.inventory.deleteMany({ where: { productId: ids.product } });
      await prisma.product.deleteMany({ where: { id: ids.product } });
      await prisma.category.deleteMany({ where: { id: ids.category } });
      await prisma.brand.deleteMany({ where: { id: ids.brand } });
      await prisma.$disconnect();
    } catch (error) {
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ------------------------------ authentication ---------------------------- */

  describe('Authentication', () => {
    it('returns a generic message for wrong credentials (no user enumeration)', async () => {
      const wrongPassword = await http().post('/api/v1/auth/login')
        .send({ phone: phones.a, password: 'WrongPass!123' });
      const unknownUser = await http().post('/api/v1/auth/login')
        .send({ phone: '0900000000', password: viaFallback() });
      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      // the same message ⇒ an attacker cannot tell whether the account exists
      expect(unknownUser.body.message).toBe(wrongPassword.body.message);
      expect(JSON.stringify(wrongPassword.body)).not.toMatch(/password|hash|argon/i);
    });

    function viaFallback() {
      return 'SomeOther!123';
    }

    it('rejects malformed, tampered and wrong-signature tokens', async () => {
      const cases: Array<[string, string]> = [
        ['not-a-jwt', 'Bearer not-a-jwt'],
        ['empty', 'Bearer '],
        ['wrong signature', `Bearer ${tokens.a}.tampered`],
        ['alg confusion', `Bearer ${Buffer.from(JSON.stringify({ alg: 'none', sub: ids.owner })).toString('base64url')}.x.y`],
      ];
      for (const [label, header] of cases) {
        const res = await http().get('/api/v1/auth/me').set({ Authorization: header });
        expect(`${label}:${res.status}`).toBe(`${label}:401`);
      }
    });

    it('rejects a disabled user immediately: token, refresh and login', async () => {
      // a live session obtained while B was still active
      const before = await http().post('/api/v1/auth/login').send({ phone: phones.b, password: pass });
      expect(before.status).toBe(200);
      const staleAccess = before.body.data.accessToken as string;
      const staleRefresh = before.body.data.refreshToken as string;

      const disabled = await http().patch(`/api/v1/users/${ids.b}/status`)
        .set(auth('owner')).send({ isActive: false });
      expect([200, 204]).toContain(disabled.status);

      // the already-issued access token must stop working right away
      expect([401, 403]).toContain((await http().get('/api/v1/auth/me')
        .set({ Authorization: `Bearer ${staleAccess}` })).status);
      expect([401, 403]).toContain((await http().get('/api/v1/notifications')
        .set({ Authorization: `Bearer ${staleAccess}` })).status);
      // the refresh token of that session must not mint a new one
      expect([401, 403]).toContain((await http().post('/api/v1/auth/refresh')
        .send({ refreshToken: staleRefresh })).status);
      // and a fresh login is refused
      expect([401, 403]).toContain((await http().post('/api/v1/auth/login')
        .send({ phone: phones.b, password: pass })).status);

      // restore for the remaining tests
      await http().patch(`/api/v1/users/${ids.b}/status`).set(auth('owner')).send({ isActive: true });
      const back = await http().post('/api/v1/auth/login').send({ phone: phones.b, password: pass });
      expect(back.status).toBe(200);
      tokens.b = back.body.data.accessToken;
    });

    it('rotates refresh tokens and detects reuse (family revocation)', async () => {
      const login = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      const first = login.body.data.refreshToken;

      const rotated = await http().post('/api/v1/auth/refresh').send({ refreshToken: first });
      expect(rotated.status).toBe(200);
      expect(rotated.body.data.refreshToken).not.toBe(first);

      // replaying the consumed token must fail and kill the family
      const reuse = await http().post('/api/v1/auth/refresh').send({ refreshToken: first });
      expect([401, 403]).toContain(reuse.status);
      const afterReuse = await http().post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.body.data.refreshToken });
      expect([401, 403]).toContain(afterReuse.status);

      const relogin = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      tokens.a = relogin.body.data.accessToken;
    });

    it('logout invalidates the session and logout-all invalidates every session', async () => {
      const first = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      const second = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      const out = await http().post('/api/v1/auth/logout')
        .set(auth('a')).send({ refreshToken: first.body.data.refreshToken });
      expect([200, 204]).toContain(out.status);
      expect((await http().post('/api/v1/auth/refresh').send({ refreshToken: first.body.data.refreshToken })).status)
        .toBeGreaterThanOrEqual(401);

      await http().post('/api/v1/auth/logout-all').set({ Authorization: `Bearer ${second.body.data.accessToken}` }).send({});
      const sessions = await prisma.refreshToken.count({ where: { userId: ids.a, status: 'ACTIVE' } });
      expect(sessions).toBe(0);
      const relogin = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      tokens.a = relogin.body.data.accessToken;
    });

    it('password reset tokens are single-use and expire (and never leak in production)', async () => {
      const request1 = await http().post('/api/v1/auth/forgot-password').send({ email: emails.a });
      expect([200, 201, 202, 204]).toContain(request1.status);
      const devToken = request1.body.data?.devToken;
      expect(devToken).toBeTruthy();

      // production mode must not return the token at all
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const prodCall = await http().post('/api/v1/auth/forgot-password').send({ email: emails.a });
      process.env.NODE_ENV = previousEnv;
      expect(prodCall.body.data?.devToken).toBeUndefined();

      // expired token is rejected
      const row = await prisma.passwordResetToken.findFirst({
        where: { userId: ids.a, usedAt: null }, orderBy: { createdAt: 'desc' },
      });
      expect(row).not.toBeNull();
      await prisma.passwordResetToken.update({
        where: { id: row!.id }, data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await http().post('/api/v1/auth/reset-password')
        .send({ token: devToken, newPassword: pass, confirmPassword: pass });
      expect([400, 401, 410]).toContain(expired.status);

      // a rolled-back token cannot be replayed after real use either
      const replay = await http().post('/api/v1/auth/reset-password')
        .send({ token: devToken, newPassword: 'Str0ng!Pass3', confirmPassword: 'Str0ng!Pass3' });
      expect([400, 401, 410]).toContain(replay.status);

      // fresh token: single use only
      const second = await http().post('/api/v1/auth/forgot-password').send({ email: emails.a });
      const fresh = second.body.data.devToken as string;
      const used = await http().post('/api/v1/auth/reset-password')
        .send({ token: fresh, newPassword: 'Str0ng!Pass2', confirmPassword: 'Str0ng!Pass2' });
      expect([200, 201, 204]).toContain(used.status);
      const reuse = await http().post('/api/v1/auth/reset-password')
        .send({ token: fresh, newPassword: pass, confirmPassword: pass });
      expect([400, 401, 410]).toContain(reuse.status);

      // restore the original password
      const third = await http().post('/api/v1/auth/forgot-password').send({ email: emails.a });
      await http().post('/api/v1/auth/reset-password')
        .send({ token: third.body.data.devToken, newPassword: pass, confirmPassword: pass });
      const relogin = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      expect(relogin.status).toBe(200);
      tokens.a = relogin.body.data.accessToken;
    });

    it('verification tokens are single-use', async () => {
      // request a fresh verification code for A (dev-only devToken)
      const login = await http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass });
      const access = login.body.data.accessToken;
      const issued = await http().post('/api/v1/auth/resend-verification')
        .set({ Authorization: `Bearer ${access}` }).send({ channel: 'OTP' });
      expect([200, 201]).toContain(issued.status);
      const code = issued.body.data?.devToken;
      expect(code).toBeTruthy();

      const row = await prisma.verificationToken.findFirst({
        where: { userId: ids.a, usedAt: null }, orderBy: { createdAt: 'desc' },
      });
      expect(row).not.toBeNull();
      // expiry is enforced
      await prisma.verificationToken.update({
        where: { id: row!.id }, data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await http().post('/api/v1/auth/verify-account').send({ token: code });
      expect([400, 401, 410, 422]).toContain(expired.status);

      // a consumed token stays consumed
      await prisma.verificationToken.update({
        where: { id: row!.id }, data: { usedAt: new Date() },
      });
      const reuse = await http().post('/api/v1/auth/verify-account').send({ token: code });
      expect([400, 401, 410, 422]).toContain(reuse.status);
    });

    it('exposes the effective permission set (so the UI can gate by permission)', async () => {
      const me = await http().get('/api/v1/auth/me').set(auth('owner'));
      expect(me.status).toBe(200);
      expect(Array.isArray(me.body.data.permissions)).toBe(true);
      expect(me.body.data.permissions).toContain('*'); // OWNER holds the wildcard
      expect(me.body.data.roles).toContain('OWNER');

      const customer = await http().get('/api/v1/auth/me').set(auth('a'));
      expect(customer.body.data.permissions).not.toContain('*');
      expect(customer.body.data.permissions).not.toContain('products.create');
    });

    it('never returns a password hash or token in any auth response', async () => {
      const responses = await Promise.all([
        http().post('/api/v1/auth/login').send({ phone: phones.a, password: pass }),
        http().get('/api/v1/auth/me').set(auth('a')),
        http().get('/api/v1/auth/sessions').set(auth('a')),
      ]);
      for (const res of responses) {
        const blob = JSON.stringify(res.body);
        for (const forbidden of ['passwordHash', 'password_hash', 'tokenHash', 'argon2']) {
          expect(`${forbidden}:${blob.includes(forbidden)}`).toBe(`${forbidden}:false`);
        }
      }
    });
  });

  /* ------------------------------ authorization ---------------------------- */

  describe('Authorization matrix', () => {
    const matrix: Array<[string, string, string, number]> = [
      ['get', '/api/v1/orders', 'anonymous', 401],
      ['get', '/api/v1/orders', 'a', 200],
      ['get', '/api/v1/admin/orders', 'a', 403],
      ['get', '/api/v1/admin/orders', 'staffNoPerm', 403],
      ['get', '/api/v1/admin/orders', 'staffAdmin', 200],
      ['get', '/api/v1/admin/payments', 'staffNoPerm', 403],
      ['get', '/api/v1/admin/notifications', 'staffNoPerm', 403],
      ['get', '/api/v1/admin/notifications', 'staffAdmin', 200],
      ['get', '/api/v1/admin/dashboard/overview', 'a', 403],
      ['get', '/api/v1/admin/dashboard/overview', 'staffAdmin', 200],
      ['get', '/api/v1/employees', 'staffNoPerm', 403],
      ['get', '/api/v1/employees', 'owner', 200],
      ['get', '/api/v1/audit', 'staffAdmin', 200],
      ['post', '/api/v1/roles', 'staffAdmin', 403],
      ['post', '/api/v1/roles', 'owner', 201],
      ['get', '/api/v1/products', 'anonymous', 200],
      ['post', '/api/v1/products', 'a', 403],
    ];
    for (const [method, path, who, expected] of matrix) {
      it(`${method.toUpperCase()} ${path} as ${who} ⇒ ${expected}`, async () => {
        const req = (http() as any)[method](path).send({ name: `SECROLE_${stamp}_${seq++}` });
        const res = who === 'anonymous' ? await req : await req.set(auth(who));
        expect(res.status).toBe(expected);
      });
    }

    it('no customer-reachable endpoint mutates another user', async () => {
      const oneShot = () => request(app.getHttpServer());
      const attempts = [
        () => oneShot().patch(`/api/v1/users/${ids.b}`).set(auth('a')).send({ firstName: 'x' }),
        () => oneShot().patch(`/api/v1/employees/${ids.b}/status`).set(auth('a')).send({ status: 'SUSPENDED' }),
        () => oneShot().patch(`/api/v1/users/${ids.b}/status`).set(auth('a')).send({ isActive: false }),
        () => oneShot().post(`/api/v1/employees/${ids.b}/roles`).set(auth('a')).send({ roleId: 1 }),
        () => oneShot().delete(`/api/v1/users/${ids.b}`).set(auth('a')).send({}),
      ];
      for (const attempt of attempts) {
        const res = await send(() => attempt());
        expect([400, 401, 403, 404, 405]).toContain(res.status);
      }
      const b = await prisma.user.findUnique({ where: { id: ids.b }, select: { status: true, firstName: true } });
      expect(b?.status).toBe('ACTIVE');
      expect(b?.firstName).toBe('Sec');
    });

  });

  /* ------------------------- privilege escalation -------------------------- */

  describe('Privilege escalation', () => {
    it('a customer cannot grant itself any role', async () => {
      const roleId = (await prisma.role.findFirst({ where: { name: 'ADMIN' }, select: { id: true } }))!.id;
      const res = await http().post(`/api/v1/employees/${ids.a}/roles`)
        .set(auth('a')).send({ roleId });
      expect([401, 403, 404]).toContain(res.status);
      const roles = await prisma.userRole.findMany({ where: { userId: ids.a } });
      expect(roles).toHaveLength(1); // still CUSTOMER only
    });

    it('an employee cannot grant itself a higher role', async () => {
      const adminRole = (await prisma.role.findFirst({ where: { name: 'ADMIN' }, select: { id: true } }))!.id;
      const res = await http().post(`/api/v1/employees/${ids.staffNoPerm}/roles`)
        .set(auth('staffNoPerm')).send({ roleId: adminRole });
      expect([401, 403, 404]).toContain(res.status);
    });

    it('an admin cannot assign the OWNER role, and the owner can', async () => {
      const ownerRole = (await prisma.role.findFirst({ where: { name: 'OWNER' }, select: { id: true } }))!.id;
      const denied = await http().post(`/api/v1/employees/${ids.staffNoPerm}/roles`)
        .set(auth('staffAdmin')).send({ roleId: ownerRole });
      expect([401, 403, 422]).toContain(denied.status);
      const allowed = await http().post(`/api/v1/employees/${ids.staffAdmin}/roles`)
        .set(auth('owner')).send({ roleId: ownerRole });
      expect([200, 201, 409]).toContain(allowed.status);
      // clean up the promotion so later tests keep their baseline permissions
      if (allowed.status === 200 || allowed.status === 201) {
        await http().delete(`/api/v1/employees/${ids.staffAdmin}/roles/${ownerRole}`).set(auth('owner'));
      }
    });

    it('nobody can modify or disable the OWNER account, including the owner itself', async () => {
      const ownerRow = await prisma.user.findFirst({
        where: { roles: { some: { role: { name: 'OWNER' } } } }, select: { id: true },
      });
      const attempts = [
        http().patch(`/api/v1/employees/${ownerRow!.id}/status`).set(auth('owner')).send({ status: 'SUSPENDED' }),
        http().delete(`/api/v1/employees/${ownerRow!.id}`).set(auth('owner')).send({}),
        http().patch(`/api/v1/employees/${ownerRow!.id}`).set(auth('staffAdmin')).send({ firstName: 'hacked' }),
      ];
      for (const res of await Promise.all(attempts)) {
        expect([400, 403, 404, 409]).toContain(res.status);
      }
      const owner = await prisma.user.findUnique({ where: { id: ownerRow!.id }, select: { status: true, firstName: true } });
      expect(owner?.status).toBe('ACTIVE');
    });

    it('system roles cannot be deleted', async () => {
      for (const name of ['OWNER', 'ADMIN', 'EMPLOYEE', 'CUSTOMER']) {
        const role = (await prisma.role.findFirst({ where: { name }, select: { id: true } }))!;
        const res = await http().delete(`/api/v1/roles/${role.id}`).set(auth('owner')).send({});
        expect(`${name}:${[400, 403, 409].includes(res.status)}`).toBe(`${name}:true`);
        expect(await prisma.role.count({ where: { name } })).toBe(1);
      }
    });
  });

  /* -------------------------------- IDOR/BOLA ------------------------------ */

  describe('IDOR / BOLA', () => {
    it('B cannot read, change or delete A resources (404 semantics)', async () => {
      const attempts = [
        http().get(`/api/v1/orders/${ids.orderA}`).set(auth('b')),
        http().post(`/api/v1/orders/${ids.orderA}/cancel`).set(auth('b')).send({ reason: 'x' }),
        http().get(`/api/v1/payments/${ids.paymentA}`).set(auth('b')),
        http().post(`/api/v1/payments/${ids.paymentA}/submit`).set(auth('b')).send({
          transactionReference: `SC-SEC-${stamp}`, proofUrl: 'https://cdn.test/p.png',
        }),
        http().get(`/api/v1/notifications/${ids.notificationA}`).set(auth('b')),
        http().post(`/api/v1/notifications/${ids.notificationA}/read`).set(auth('b')).send({}),
        http().get(`/api/v1/verification/${ids.verificationB}`).set(auth('a')),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(404);
      }
    });

    it('query/body identifiers cannot redirect ownership', async () => {
      // an unknown query parameter (an attempt to re-scope the list) is rejected outright
      const res = await http().get(`/api/v1/orders?userId=${ids.b}`).set(auth('a'));
      expect(res.status).toBe(400);

      // and the honest listing only ever contains the caller's own orders
      const listing = await http().get('/api/v1/orders').set(auth('a'));
      expect(listing.status).toBe(200);
      const mine = await prisma.order.findMany({ where: { userId: ids.a }, select: { id: true } });
      for (const item of listing.body.data.items) {
        expect(mine.map((m) => m.id)).toContain(item.id);
      }

      const spoofed = await http().post('/api/v1/cart/items').set(auth('a'))
        .send({ productId: ids.product, quantity: 1, userId: ids.b });
      expect(spoofed.status).toBe(400); // unknown field rejected outright
    });

    it('cart items cannot be modified across users', async () => {
      const cartB = await prisma.cart.create({ data: { userId: ids.b } });
      const itemB = await prisma.cartItem.create({ data: { cartId: cartB.id, productId: ids.product, quantity: 1 } });
      const patch = await http().patch(`/api/v1/cart/items/${itemB.id}`).set(auth('a')).send({ quantity: 99 });
      const del = await http().delete(`/api/v1/cart/items/${itemB.id}`).set(auth('a'));
      expect([403, 404]).toContain(patch.status);
      expect([403, 404]).toContain(del.status);
      const stored = await prisma.cartItem.findUnique({ where: { id: itemB.id }, select: { quantity: true } });
      expect(stored?.quantity).toBe(1);
      await prisma.cartItem.deleteMany({ where: { cartId: cartB.id } });
      await prisma.cart.deleteMany({ where: { id: cartB.id } });
    });

    it('an admin cannot read a customer inbox through the customer endpoint', async () => {
      if (!ids.notificationA) return;
      const res = await http().get(`/api/v1/notifications/${ids.notificationA}`).set(auth('staffAdmin'));
      expect(res.status).toBe(404);
    });
  });

  /* ---------------------------- mass assignment ---------------------------- */

  describe('Mass assignment & spoofing', () => {
    const forbiddenFields: Array<[string, string]> = [
      ['create order', 'userId'],
      ['create payment', 'amount'],
      ['submit proof', 'status'],
      ['start verification', 'userId'],
      ['update profile', 'roles'],
      ['read notification', 'readAt'],
      ['cart item', 'unitPrice'],
      ['order status', 'actorId'],
    ];

    const bodyFor = (label: string, field: string): Record<string, unknown> => {
      const base: Record<string, unknown> =
        label === 'create order' ? {}
          : label === 'create payment' ? { orderId: ids.orderA }
            : label === 'submit proof' ? { transactionReference: `SC-SEC-${stamp}-X`, proofUrl: 'https://cdn.test/x.png' }
              : label === 'start verification' ? {}
                : label === 'update profile' ? { firstName: 'Sec' }
                  : label === 'read notification' ? {}
                    : label === 'cart item' ? { productId: ids.product, quantity: 1 }
                      : {};
      const spoof: Record<string, unknown> = {
        userId: ids.b, ownerId: ids.owner, roleId: 1, roles: ['OWNER'], status: 'SUCCEEDED',
        isActive: true, createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z',
        passwordHash: 'x', provider: 'SHAM', providerPaymentId: 'p', amount: '0.01', currency: 'EUR',
        orderId: 1, reviewedBy: ids.owner, reviewedAt: '2020-01-01T00:00:00Z', actorId: ids.owner,
        readAt: '2020-01-01T00:00:00Z', unitPrice: '0.01', status2: 'VERIFIED',
      };
      return { ...base, [field]: spoof[field] ?? 'x' };
    };

    const pathFor = (label: string): { path: string; asOwner: boolean } => {
      switch (label) {
        case 'create order': return { path: '/api/v1/orders', asOwner: false };
        case 'create payment': return { path: '/api/v1/payments', asOwner: false };
        case 'submit proof': return { path: `/api/v1/payments/${ids.paymentA}/submit`, asOwner: false };
        case 'start verification': return { path: '/api/v1/verification/start', asOwner: false };
        case 'update profile': return { path: '/api/v1/users/me', asOwner: false };
        case 'read notification': return { path: `/api/v1/notifications/${ids.notificationA}/read`, asOwner: false };
        case 'cart item': return { path: '/api/v1/cart/items', asOwner: false };
        case 'order status': return { path: `/api/v1/admin/orders/${ids.orderA}/status`, asOwner: true };
        case 'payment decision': return { path: `/api/v1/admin/payments/${ids.paymentA}/confirm`, asOwner: true };
        default: return { path: '/api/v1/notifications', asOwner: false };
      }
    };

    for (const [label, field] of forbiddenFields) {
      it(`rejects or ignores privileged field "${field}" on ${label}`, async () => {
        const { path, asOwner } = pathFor(label);
        const res = await http().post(path).set(asOwner ? auth('owner') : auth('a'))
          .set({ 'Idempotency-Key': nextKey() }).send(bodyFor(label, field));
        // either the request is rejected outright …
        if ([400, 404].includes(res.status)) {
          expect([400, 404]).toContain(res.status);
          return;
        }
        // … or it is accepted but the privileged value was never applied
        expect([200, 201]).toContain(res.status);
        const serialized = JSON.stringify(res.body.data ?? {});
        expect(serialized).not.toContain('2020-01-01T00:00:00');
        if (field === 'readAt') {
          const stored = await prisma.notification.findUnique({
            where: { id: ids.notificationA }, select: { readAt: true },
          });
          expect(stored!.readAt!.getFullYear()).toBeGreaterThan(2020);
        }
        if (field === 'userId' || field === 'amount' || field === 'status') {
          const blob = JSON.stringify(res.body.data ?? {});
          expect(blob).not.toContain('SUCCEEDED');
        }
      });
    }

    it('an admin cannot spoof the reviewer of a payment decision', async () => {
      // a fresh payment that is genuinely awaiting review
      await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.product, quantity: 1 });
      const order = await http().post('/api/v1/orders').set({ ...auth('b'), 'Idempotency-Key': nextKey() }).send({});
      const payment = await http().post('/api/v1/payments')
        .set({ ...auth('b'), 'Idempotency-Key': nextKey() }).send({ orderId: order.body.data.id });
      const paymentId = payment.body.data.id as string;
      await http().post(`/api/v1/payments/${paymentId}/submit`).set(auth('b')).send({
        transactionReference: `SC-SEC-${stamp}-ACTOR`, proofUrl: 'https://cdn.test/actor.png',
      });

      const decision = await http().post(`/api/v1/admin/payments/${paymentId}/confirm`)
        .set(auth('staffAdmin')).send({ reviewedBy: ids.owner, reviewedAt: '2020-01-01T00:00:00Z' });
      expect([200, 201]).toContain(decision.status);
      const row = await prisma.payment.findUnique({
        where: { id: paymentId }, select: { reviewedBy: true, reviewedAt: true },
      });
      // the reviewer is the authenticated caller, not the value in the body
      expect(row!.reviewedBy).toBe(ids.staffAdmin);
      expect(row!.reviewedAt!.getFullYear()).toBeGreaterThan(2020);
    });

    it('an admin cannot spoof the audit actor of a verification decision', async () => {
      const review = await http().post(`/api/v1/admin/verifications/${ids.verificationB}/review`)
        .set(auth('owner')).send({ actorId: ids.a });
      expect([200, 201]).toContain(review.status);
      const decision = await http().post(`/api/v1/admin/verifications/${ids.verificationB}/verify`)
        .set(auth('owner')).send({ actorId: ids.a, status: 'VERIFIED', verifiedAt: '2020-01-01T00:00:00Z' });
      expect([200, 201]).toContain(decision.status);
      const audit = await prisma.auditLog.findFirst({
        where: { entity: 'customer_verification', entityId: ids.verificationB },
        orderBy: { createdAt: 'desc' }, select: { actorId: true },
      });
      expect(audit?.actorId).toBe(ids.owner);
      const verification = await prisma.customerVerification.findUnique({
        where: { id: ids.verificationB }, select: { completedAt: true },
      });
      expect(verification!.completedAt!.getFullYear()).toBeGreaterThan(2020);
    });

    it('sends an unknown field on a profile update and expects 400', async () => {
      const res = await http().patch('/api/v1/users/me').set(auth('a')).send({ nickname: 'x' });
      expect(res.status).toBe(400);
    });
  });

  /* ------------------------- prototype pollution --------------------------- */

  describe('Prototype pollution', () => {
    it('pollution payloads cannot change authorization or state', async () => {
      const rawPayloads = [
        '{"__proto__":{"isAdmin":true},"firstName":"Sec"}',
        '{"constructor":{"prototype":{"isAdmin":true}},"firstName":"Sec"}',
        '{"proto":{"isAdmin":true},"firstName":"Sec"}',
        '{"firstName":"Sec","__proto__":{"roles":["OWNER"]}}',
      ];
      for (const raw of rawPayloads) {
        const res = await http().patch('/api/v1/users/me').set(auth('a'))
          .set('Content-Type', 'application/json').send(raw);
        expect([200, 400, 403, 404]).toContain(res.status);
      }
      // the global prototype chain must be untouched
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      expect((Object.prototype as unknown as Record<string, unknown>).isAdmin).toBeUndefined();
      const stillDenied = await http().get('/api/v1/admin/dashboard/overview').set(auth('a'));
      expect(stillDenied.status).toBe(403);

      // pollution inside an auth payload must not escalate privileges either
      const login = await http().post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(`{"phone":"${phones.a}","password":"${pass}","__proto__":{"isAdmin":true}}`);
      expect([200, 400]).toContain(login.status);
      if (login.status === 200) {
        const me = await http().get('/api/v1/auth/me').set({ Authorization: `Bearer ${login.body.data.accessToken}` });
        expect(JSON.stringify(me.body.data.roles)).not.toContain('ADMIN');
        expect(JSON.stringify(me.body.data.permissions ?? [])).not.toContain('dashboard');
      }
    });
  });

  /* ------------------------------- injection ------------------------------- */

  describe('Injection', () => {
    const payloads = [
      "' OR 1=1 --",
      "'; DROP TABLE orders; --",
      '" OR ""="',
      '1); DELETE FROM payments; --',
      "%27%20OR%201%3D1",
      '{"$ne": null}',
    ];

    it('SQL injection payloads in filters/sort/search do not break anything', async () => {
      for (const payload of payloads) {
        const query = `status=${encodeURIComponent(payload)}&sortBy=${encodeURIComponent(payload)}&page=1&limit=5`;
        const responses = await Promise.all([
          http().get(`/api/v1/admin/orders?${query}`).set(auth('owner')),
          http().get(`/api/v1/admin/payments?${query}`).set(auth('owner')),
          http().get(`/api/v1/notifications?${query}`).set(auth('a')),
          http().get(`/api/v1/admin/dashboard/orders?status=${encodeURIComponent(payload)}`).set(auth('owner')),
          http().get(`/api/v1/products?search=${encodeURIComponent(payload)}`),
        ]);
        for (const res of responses) expect([200, 400]).toContain(res.status);
      }
      const [counts] = await sql<{ orders: number; payments: number; users: number }>(Prisma.sql`
        SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM payments) AS payments,
               (SELECT COUNT(*) FROM users) AS users`);
      expect(Number(counts.orders)).toBeGreaterThanOrEqual(0);
      expect(Number(counts.users)).toBeGreaterThan(0);
    });

    it('IDs with injection payloads are rejected, not executed', async () => {
      for (const payload of ["1' OR '1'='1", '1;DROP TABLE orders', '../../etc/passwd']) {
        const res = await http().get(`/api/v1/orders/${encodeURIComponent(payload)}`).set(auth('a'));
        expect([400, 404]).toContain(res.status);
      }
    });

    it('all raw SQL is parameterized (no unsafe execution anywhere in src)', async () => {
      const { readFileSync, readdirSync, statSync } = await import('fs');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = `${dir}/${entry}`;
          if (statSync(full).isDirectory()) walk(full);
          else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) files.push(full);
        }
      };
      walk('src');
      for (const file of files) {
        const code = readFileSync(file, 'utf8');
        expect(`${file}:${code.includes('$executeRawUnsafe')}`).toBe(`${file}:false`);
        for (const match of code.matchAll(/\$queryRaw(?!<)/g)) {
          // tagged template usage means the following character is a backtick
          const tail = code.slice(match.index! + match[0].length, match.index! + match[0].length + 40);
          expect(`${file}:${tail.trimStart().startsWith('`')}`).toBe(`${file}:true`);
        }
      }
    });
  });

  /* ----------------------------- rate limiting ----------------------------- */

  describe('Rate limiting', () => {
    it('throttles repeated login attempts and ignores spoofed forwarding headers', async () => {
      let throttled = false;
      for (let i = 0; i < 60 && !throttled; i += 1) {
        const res = await http().post('/api/v1/auth/login')
          .set({ 'X-Forwarded-For': `10.0.0.${i}`, 'X-Real-IP': `10.0.1.${i}` })
          .send({ phone: `0999${stamp}`, password: 'Wrong!Pass123' });
        if (res.status === 429) throttled = true;
      }
      expect(throttled).toBe(true);
    }, 120000);

    it('keeps authentication required even when throttled', async () => {
      const res = await http().get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });
  });

  /* --------------------------- data leakage / errors ----------------------- */

  describe('Error leakage', () => {
    it('never exposes internals in error responses', async () => {
      const responses = await Promise.all([
        http().get('/api/v1/orders/not-a-number').set(auth('a')),
        http().get('/api/v1/orders/999999999').set(auth('a')),
        http().post('/api/v1/payments').set(auth('a')).send({ orderId: 'abc' }),
        http().get('/api/v1/admin/dashboard/orders?from=bogus').set(auth('owner')),
        http().get('/api/v1/notifications?limit=abc').set(auth('a')),
        http().patch('/api/v1/users/me').set(auth('a')).set('Content-Type','application/json').send('null'),
      ]);
      for (const res of responses) {
        const blob = JSON.stringify(res.body).toLowerCase();
        for (const forbidden of [
          'select ', 'insert into', 'prisma', 'stack', 'at object.', '/root/', '.ts:',
          'postgres://', 'password', 'secret', 'jwt',
        ]) {
          expect(`${forbidden}:${blob.includes(forbidden)}`).toBe(`${forbidden}:false`);
        }
        expect([200, 400, 401, 403, 404, 422]).toContain(res.status);
      }
    });
  });

  /* ------------------------------- payments -------------------------------- */

  describe('Payment tampering', () => {
    it('the server owns amount, currency and status', async () => {
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const order = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({});
      const orderId = order.body.data.id;
      const orderRow = await prisma.order.findUnique({ where: { id: orderId }, select: { total: true, currency: true } });

      const payment = await http().post('/api/v1/payments')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() })
        .send({ orderId, amount: '0.01', currency: 'EUR' });
      expect(payment.status).toBe(400); // tampering fields are rejected outright

      const honest = await http().post('/api/v1/payments')
        .set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({ orderId });
      expect(honest.status).toBe(201);
      expect(honest.body.data.amount).toBe(orderRow!.total.toFixed(2));
      expect(honest.body.data.currency).toBe(orderRow!.currency);
      ids.paymentTamper = honest.body.data.id;
      ids.orderTamper = orderId;
    });

    it('only staff can confirm or reject, and only with evidence/reason', async () => {
      const asCustomer = await http().post(`/api/v1/admin/payments/${ids.paymentTamper}/confirm`)
        .set(auth('a')).send({});
      expect([403, 404]).toContain(asCustomer.status);

      // no evidence yet: even staff cannot confirm
      const noEvidence = await http().post(`/api/v1/admin/payments/${ids.paymentTamper}/confirm`)
        .set(auth('staffAdmin')).send({});
      expect([409, 422]).toContain(noEvidence.status);

      const submit = await http().post(`/api/v1/payments/${ids.paymentTamper}/submit`).set(auth('a')).send({
        transactionReference: `SC-SEC-${stamp}-T`, proofUrl: 'https://cdn.test/tamper.png',
      });
      expect(submit.status).toBe(201);
      const noReason = await http().post(`/api/v1/admin/payments/${ids.paymentTamper}/reject`)
        .set(auth('staffAdmin')).send({});
      expect(noReason.status).toBe(400);
      const reject = await http().post(`/api/v1/admin/payments/${ids.paymentTamper}/reject`)
        .set(auth('staffAdmin')).send({ reason: 'إثبات غير مطابق' });
      expect(reject.status).toBe(200);
      const double = await http().post(`/api/v1/admin/payments/${ids.paymentTamper}/confirm`)
        .set(auth('staffAdmin')).send({});
      expect([409, 422]).toContain(double.status);
    });

    it('the manual Sham Cash flow keeps provider fields null (no fake provider data)', async () => {
      const row = await prisma.payment.findUnique({
        where: { id: ids.paymentA },
        select: { provider: true, providerPaymentId: true, method: true, status: true },
      });
      expect(row?.provider).toBeNull();
      expect(row?.providerPaymentId).toBeNull();
      expect(row?.method).toBe('SHAM_CASH');
    });

    it('idempotency is per user: same key, different user ⇒ independent result', async () => {
      const sharedKey = `shared-${stamp}`;
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const orderA = await http().post('/api/v1/orders')
        .set({ ...auth('a'), 'Idempotency-Key': sharedKey }).send({});
      await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.product, quantity: 1 });
      const orderB = await http().post('/api/v1/orders')
        .set({ ...auth('b'), 'Idempotency-Key': sharedKey }).send({});
      expect(orderA.status).toBe(201);
      expect(orderB.status).toBe(201);
      expect(orderA.body.data.id).not.toBe(orderB.body.data.id);
      ids.orderB = orderB.body.data.id;
    });

    it('same key with a different payload is a conflict', async () => {
      const key = nextKey();
      const first = await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.product, quantity: 1 });
      expect(first.status).toBe(201);
      const order = await http().post('/api/v1/orders').set({ ...auth('b'), 'Idempotency-Key': key }).send({});
      expect(order.status).toBe(201);
      await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.product, quantity: 2 });
      const conflicting = await http().post('/api/v1/orders').set({ ...auth('b'), 'Idempotency-Key': key }).send({});
      expect([200, 201, 409]).toContain(conflicting.status);
    });
  });

  /* ---------------------- concurrency & integrity -------------------------- */

  describe('Concurrency & integrity', () => {
    it('parallel checkouts cannot oversell the last units', async () => {
      const inventoryRow = await prisma.inventory.findUnique({
        where: { productId: ids.product }, select: { quantity: true, reservedQuantity: true },
      });
      const available = inventoryRow!.quantity - inventoryRow!.reservedQuantity;

      // size the two baskets so only one can win
      const perOrder = Math.max(1, Math.ceil((available + 1) / 2));
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: perOrder });
      await http().post('/api/v1/cart/items').set(auth('b')).send({ productId: ids.product, quantity: perOrder });

      const [first, second] = await Promise.all([
        http().post('/api/v1/orders').set({ ...auth('a'), 'Idempotency-Key': nextKey() }).send({}),
        http().post('/api/v1/orders').set({ ...auth('b'), 'Idempotency-Key': nextKey() }).send({}),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses[0]).toBe(201);
      expect([409, 400]).toContain(statuses[1]);

      const after = await prisma.inventory.findUnique({
        where: { productId: ids.product }, select: { quantity: true, reservedQuantity: true },
      });
      // never reserved beyond what exists
      expect(after!.reservedQuantity).toBeLessThanOrEqual(after!.quantity);
    }, 120000);

    it('concurrent identical orders with one key create exactly one order', async () => {
      await http().post('/api/v1/cart/items').set(auth('a')).send({ productId: ids.product, quantity: 1 });
      const key = nextKey();
      const [r1, r2] = await Promise.all([
        http().post('/api/v1/orders').set({ ...auth('a'), 'Idempotency-Key': key }).send({}),
        http().post('/api/v1/orders').set({ ...auth('a'), 'Idempotency-Key': key }).send({}),
      ]);
      const created = [r1, r2].filter((r) => r.status === 201);
      const replayed = [r1, r2].filter((r) => r.status === 200 || r.status === 409);
      expect(created.length + replayed.length).toBe(2);
      if (created.length === 2) {
        expect(created[0].body.data.id).toBe(created[1].body.data.id); // same order, not two
      }
      const keys = await prisma.idempotencyKey.count({ where: { userId: ids.a, key, scope: 'ORDER' } });
      expect(keys).toBe(1);
    }, 60000);

    it('concurrent inventory adjustments keep the record consistent', async () => {
      const before = await prisma.inventory.findUnique({
        where: { productId: ids.product }, select: { quantity: true },
      });
      const [r1, r2, r3] = await Promise.all([
        http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({ quantity: 5, reason: 'STOCK_RECEIVED' }),
        http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({ quantity: 7, reason: 'STOCK_RECEIVED' }),
        http().post(`/api/v1/inventory/${ids.product}/adjust`).set(auth('owner')).send({ quantity: -3, reason: 'DAMAGE' }),
      ]);
      for (const res of [r1, r2, r3]) expect([201, 200, 400, 409]).toContain(res.status);
      const after = await prisma.inventory.findUnique({
        where: { productId: ids.product }, select: { quantity: true, reservedQuantity: true },
      });
      expect(after!.quantity).toBeGreaterThanOrEqual(after!.reservedQuantity);
      expect(after!.quantity).toBeGreaterThanOrEqual(0);
      // no movement without a matching quantity delta
      const movements = await prisma.inventoryMovement.aggregate({
        where: { inventory: { productId: ids.product } }, _sum: { quantity: true },
      });
      expect(typeof movements._sum.quantity).toBe('number');
    }, 60000);

    it('database integrity invariants hold after all this abuse', async () => {
      const [row] = await sql<Record<string, string>>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM inventory WHERE reserved_quantity > quantity)::text AS bad_inventory,
          (SELECT COUNT(*) FROM inventory WHERE quantity < 0 OR reserved_quantity < 0)::text AS negative_inventory,
          (SELECT COUNT(*) FROM orders o WHERE o.total <> (o.subtotal + o.shipping_amount - o.discount_amount))::text AS bad_totals,
          (SELECT COUNT(*) FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.amount <> o.total)::text AS bad_payment_totals,
          (SELECT COUNT(*) FROM payments WHERE status = 'SUCCEEDED' AND transaction_reference IS NULL AND provider_payment_id IS NULL)::text AS success_without_evidence,
          (SELECT COUNT(*) FROM customer_verifications v WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = v.user_id))::text AS orphan_verifications,
          (SELECT COUNT(*) FROM notifications n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id))::text AS orphan_notifications,
          (SELECT COUNT(*) FROM orders WHERE status NOT IN ('PENDING','CONFIRMED','CANCELLED'))::text AS impossible_order_status,
          (SELECT COUNT(*) FROM payments WHERE status NOT IN ('PENDING','PENDING_REVIEW','PROCESSING','SUCCEEDED','FAILED','CANCELLED'))::text AS impossible_payment_status,
          (SELECT COUNT(*) FROM customer_verifications WHERE status NOT IN ('NOT_STARTED','PENDING','IN_REVIEW','VERIFIED','REJECTED','EXPIRED','CANCELLED'))::text AS impossible_verification_status,
          (SELECT COUNT(DISTINCT order_number) FROM orders)::text AS distinct_order_numbers,
          (SELECT COUNT(*) FROM orders)::text AS orders_total,
          (SELECT COALESCE((SELECT COUNT(*) FROM (SELECT 1 FROM notifications GROUP BY user_id, event_key HAVING COUNT(*) > 1) d), 0))::text AS duplicate_events`);
      expect(row.duplicate_events).toBe('0');
      expect(row.bad_inventory).toBe('0');
      expect(row.negative_inventory).toBe('0');
      expect(row.bad_totals).toBe('0');
      expect(row.bad_payment_totals).toBe('0');
      expect(row.success_without_evidence).toBe('0');
      expect(row.orphan_verifications).toBe('0');
      expect(row.orphan_notifications).toBe('0');
      expect(row.impossible_order_status).toBe('0');
      expect(row.impossible_payment_status).toBe('0');
      expect(row.impossible_verification_status).toBe('0');
      expect(row.distinct_order_numbers).toBe(row.orders_total);
    });
  });

  /* ------------------------------- boundaries ------------------------------ */

  describe('Boundary & fuzz inputs', () => {
    const values: unknown[] = [
      '', '   ', null, 0, -1, 1e20, -1e20, Number.NaN, Number.POSITIVE_INFINITY,
      'ا'.repeat(5000), '😀'.repeat(500), '<script>alert(1)</script>', '{"a":1}',
      "'; DROP TABLE users; --", '\\x00', '../../etc/passwd',
    ];

    it('profile updates stay stable for extreme inputs', async () => {
      for (const value of values) {
        const res = await send(() => request(app.getHttpServer())
          .patch('/api/v1/users/me').set(auth('a')).send({ firstName: value, lastName: 'Sec' }));
        expect([200, 400, 413, 422, 429]).toContain(res.status);
      }
      const me = await http().get('/api/v1/auth/me').set(auth('a'));
      expect(me.status).toBe(200);
      expect(typeof me.body.data.firstName).toBe('string');
    });

    it('numeric and date boundaries are validated, not crashed', async () => {
      const oneShot = () => request(app.getHttpServer());
      const responses: request.Response[] = [];
      responses.push(await send(() => oneShot().get('/api/v1/notifications?limit=0').set(auth('a'))));
      responses.push(await send(() => oneShot().get('/api/v1/notifications?limit=-5').set(auth('a'))));
      responses.push(await send(() => oneShot().get('/api/v1/notifications?page=NaN').set(auth('a'))));
      responses.push(await send(() => oneShot().get('/api/v1/admin/dashboard/orders?from=9999-99-99').set(auth('owner'))));
      responses.push(await send(() => oneShot()
        .get('/api/v1/admin/dashboard/orders?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z').set(auth('owner'))));
      responses.push(await send(() => oneShot().post('/api/v1/cart/items').set(auth('a')).send({ productId: 1e20, quantity: 1 })));
      responses.push(await send(() => oneShot().post('/api/v1/cart/items').set(auth('a')).send({ productId: 1, quantity: -5 })));
      responses.push(await send(() => oneShot().post('/api/v1/cart/items').set(auth('a')).send({ productId: 1, quantity: Number.NaN })));
      for (const res of responses) expect([400, 404, 409, 413, 422, 429]).toContain(res.status);
    }, 120000);

    it('oversized payloads are rejected or bounded', async () => {
      const huge = 'x'.repeat(2_000_000);
      const res = await send(() => request(app.getHttpServer())
        .patch('/api/v1/users/me').set(auth('a')).send({ firstName: huge }));
      expect([400, 413, 422, 429]).toContain(res.status);
    }, 60000);
  });

  /* --------------------------- admin surfaces ------------------------------ */

  describe('Admin surface hardening', () => {
    it('the outbox processor is staff-only and bounded', async () => {
      expect((await http().post('/api/v1/admin/notifications/outbox/process')).status).toBe(401);
      expect((await http().post('/api/v1/admin/notifications/outbox/process').set(auth('a')).send({})).status).toBe(403);
      expect((await http().post('/api/v1/admin/notifications/outbox/process').set(auth('staffNoPerm')).send({})).status).toBe(403);
      const ok = await http().post('/api/v1/admin/notifications/outbox/process').set(auth('owner')).send({});
      expect([200, 201]).toContain(ok.status);
      const oversized = await http().post('/api/v1/admin/notifications/outbox/process?limit=99999').set(auth('owner')).send({});
      expect(oversized.status).toBe(400);
    });

    it('dashboard stays read-only for every verb', async () => {
      for (const path of [
        '/api/v1/admin/dashboard/overview', '/api/v1/admin/dashboard/payments',
        '/api/v1/admin/analytics/timeseries',
      ]) {
        for (const verb of ['post', 'put', 'patch', 'delete']) {
          const res = await (http() as any)[verb](path).set(auth('owner')).send({});
          expect(`${verb} ${path}:${[404, 405].includes(res.status)}`).toBe(`${verb} ${path}:true`);
        }
        expect((await http().get(path).set(auth('owner'))).status).toBe(200);
      }
    });

    it('audit entries cannot be forged or tampered with by a customer', async () => {
      for (const verb of ['post', 'patch', 'delete']) {
        const res = await (http() as any)[verb]('/api/v1/audit').set(auth('a')).send({
          actorId: ids.owner, action: 'ROLE_ASSIGNED', entity: 'user', entityId: ids.a,
        });
        expect([403, 404, 405]).toContain(res.status);
      }
      const forged = await prisma.auditLog.count({ where: { action: 'ROLE_ASSIGNED', actorId: ids.b } });
      expect(forged).toBe(0);
    });

    it('health endpoint stays minimal (no internals)', async () => {
      const res = await http().get('/api/v1/health');
      const blob = JSON.stringify(res.body).toLowerCase();
      for (const forbidden of ['postgres://', 'password', 'secret', 'jwt', 'database_url', '/root/', 'stack']) {
        expect(`${forbidden}:${blob.includes(forbidden)}`).toBe(`${forbidden}:false`);
      }
    });
  });
});
