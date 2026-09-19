/**
 * Stage 2 e2e — real database, real HTTP stack.
 * Covers registration, login, session rotation, logout, password lifecycle,
 * verification foundation, authorization and pagination.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const prisma = new PrismaClient();
const stamp = Date.now().toString().slice(-7);
const phoneA = `09${stamp}1`;
const phoneB = `09${stamp}2`;
const createdIds: string[] = [];
let app: INestApplication;
let ownerToken = '';
const PASSWORD = 'Str0ng!Pass1';

const api = () => request(app.getHttpServer());

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const ownerPhone = process.env.SEED_OWNER_PHONE;
  const ownerPass = process.env.SEED_OWNER_PASSWORD;
  if (ownerPhone && ownerPass) {
    const res = await api().post('/api/v1/auth/login').send({ phone: ownerPhone, password: ownerPass });
    ownerToken = res.body?.data?.accessToken ?? '';
  }
}, 60_000);

afterAll(async () => {
  if (createdIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
  await app?.close();
});

const register = (phone: string, email: string) =>
  api().post('/api/v1/auth/register').send({
    firstName: 'Test', lastName: 'User', phone, email,
    password: PASSWORD, confirmPassword: PASSWORD,
  });

describe('Registration', () => {
  it('creates a CUSTOMER account and returns tokens', async () => {
    const res = await register(phoneA, `a${stamp}@example.com`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    createdIds.push(me.body.data.id);
    expect(me.body.data.roles).toEqual(['CUSTOMER']);
    expect(me.body.data.isVerified).toBe(false);
  });

  it('rejects mismatched confirmPassword', async () => {
    const res = await api().post('/api/v1/auth/register').send({
      firstName: 'A', lastName: 'B', phone: `09${stamp}9`, email: `x${stamp}@example.com`,
      password: PASSWORD, confirmPassword: 'Different1!',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a weak password', async () => {
    const res = await api().post('/api/v1/auth/register').send({
      firstName: 'A', lastName: 'B', phone: `09${stamp}8`, email: `y${stamp}@example.com`,
      password: 'weakpass', confirmPassword: 'weakpass',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate phone', async () => {
    const res = await register(phoneA, `dup${stamp}@example.com`);
    expect(res.status).toBe(409);
  });

  it('cannot self-assign a privileged role (unknown fields are stripped)', async () => {
    const res = await api().post('/api/v1/auth/register').send({
      firstName: 'A', lastName: 'B', phone: `09${stamp}7`, email: `r${stamp}@example.com`,
      password: PASSWORD, confirmPassword: PASSWORD, role: 'ADMIN', roles: ['ADMIN'],
    });
    expect(res.status).toBe(400); // forbidNonWhitelisted
  });
});

describe('Login & sessions', () => {
  let refresh1 = '';
  let access1 = '';

  it('logs in with phone', async () => {
    const res = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    expect(res.status).toBe(200);
    access1 = res.body.data.accessToken;
    refresh1 = res.body.data.refreshToken;
    expect(access1).toBeDefined();
  });

  it('returns a generic error for a wrong password', async () => {
    const res = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: 'Wr0ng!Pass9' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('بيانات الدخول غير صحيحة');
  });

  it('returns the same generic error for an unknown account', async () => {
    const res = await api().post('/api/v1/auth/login').send({ phone: '0900000000', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('بيانات الدخول غير صحيحة');
  });

  it('handles concurrent refreshes with the same token without a 5xx (one 200, one 401)', async () => {
    // Regression: two parallel refreshes used to collide on the unique token_hash placeholder and return 500.
    const login = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    expect(login.status).toBe(200);
    const parallelToken = login.body.data.refreshToken;

    const [first, second] = await Promise.all([
      api().post('/api/v1/auth/refresh').send({ refreshToken: parallelToken }),
      api().post('/api/v1/auth/refresh').send({ refreshToken: parallelToken }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 401]);
    expect([first.status, second.status]).not.toContain(500);

    // The losing request must not tear down the winner's session family.
    const winner = first.status === 200 ? first : second;
    const keepAlive = await api().post('/api/v1/auth/refresh').send({ refreshToken: winner.body.data.refreshToken });
    expect(keepAlive.status).toBe(200);

    const relogin = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    expect(relogin.status).toBe(200);
    refresh1 = relogin.body.data.refreshToken;
    access1 = relogin.body.data.accessToken;
  });

  it('rotates the refresh token and invalidates the old one', async () => {
    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: refresh1 });
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(refresh1);

    const reuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: refresh1 });
    expect(reuse.status).toBe(401);

    // Security: re-use of a consumed token is treated as compromise => all sessions revoked.
    const compromised = await api().post('/api/v1/auth/refresh').send({ refreshToken: first.body.data.refreshToken });
    expect(compromised.status).toBe(401);

    const relogin = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    expect(relogin.status).toBe(200);
    refresh1 = relogin.body.data.refreshToken;
    access1 = relogin.body.data.accessToken;
  });

  it('lists active sessions', async () => {
    const res = await api().get('/api/v1/auth/sessions').set('Authorization', `Bearer ${access1}`);
    expect(res.status).toBe(200);
    expect(res.body.data.activeSessions).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');
  });

  it('logs out the current session only', async () => {
    const login = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    const token = login.body.data.refreshToken;
    const out = await api().post('/api/v1/auth/logout').send({ refreshToken: token });
    expect(out.status).toBe(200);
    const reused = await api().post('/api/v1/auth/refresh').send({ refreshToken: token });
    expect(reused.status).toBe(401);
  });

  it('logs out from all devices', async () => {
    await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${access1}`);
    const all = await api().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${access1}`);
    expect(all.status).toBe(200);
    expect(all.body.data.revokedSessions).toBeGreaterThan(0);
    const sessions = await api().get('/api/v1/auth/sessions').set('Authorization', `Bearer ${access1}`);
    if (sessions.status === 200) expect(sessions.body.data.activeSessions).toBe(0);
    expect(me.status).toBe(200);
  });
});

describe('Profile & password lifecycle', () => {
  let token = '';

  beforeAll(async () => {
    const res = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    token = res.body.data.accessToken;
  });

  it('updates allowed profile fields only', async () => {
    const res = await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Updated');

    const forbidden = await api().patch('/api/v1/users/me').set('Authorization', `Bearer ${token}`)
      .send({ isVerified: true });
    expect(forbidden.status).toBe(400); // unknown field rejected at validation layer
  });

  it('rejects a wrong current password', async () => {
    const res = await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Wr0ng!Pass9', newPassword: PASSWORD, confirmNewPassword: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('changes the password and revokes every session', async () => {
    const res = await api().post('/api/v1/auth/change-password').set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'N3w!Passw0rd', confirmNewPassword: 'N3w!Passw0rd' });
    expect(res.status).toBe(200);
    expect(res.body.data.revokedSessions).toBeGreaterThan(0);

    const oldPassword = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: PASSWORD });
    expect(oldPassword.status).toBe(401);
    const newPassword = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: 'N3w!Passw0rd' });
    expect(newPassword.status).toBe(200);
  });

  it('forgot-password never reveals account existence', async () => {
    const known = await api().post('/api/v1/auth/forgot-password').send({ phone: phoneA });
    const unknown = await api().post('/api/v1/auth/forgot-password').send({ phone: '0900000001' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password with a single-use token', async () => {
    const req = await api().post('/api/v1/auth/forgot-password').send({ phone: phoneA });
    const resetToken = req.body.data?.devToken;
    expect(resetToken).toBeTruthy();

    const ok = await api().post('/api/v1/auth/reset-password').send({
      token: resetToken, newPassword: 'R3set!Passw0rd', confirmPassword: 'R3set!Passw0rd',
    });
    expect(ok.status).toBe(200);

    const reused = await api().post('/api/v1/auth/reset-password').send({
      token: resetToken, newPassword: 'Oth3r!Passw0rd', confirmPassword: 'Oth3r!Passw0rd',
    });
    expect(reused.status).toBe(400);

    const login = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: 'R3set!Passw0rd' });
    expect(login.status).toBe(200);
  });

  it('supports the verification foundation', async () => {
    const login = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: 'R3set!Passw0rd' });
    const access = login.body.data.accessToken;

    const resend = await api().post('/api/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${access}`).send({ channel: 'OTP' });
    expect(resend.status).toBe(200);
    const code = resend.body.data?.devToken;
    expect(code).toBeTruthy();

    const verify = await api().post('/api/v1/auth/verify-account')
      .set('Authorization', `Bearer ${access}`).send({ token: code });
    expect(verify.status).toBe(200);

    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(me.body.data.isVerified).toBe(true);
  });
});

describe('User management & authorization', () => {
  let customerToken = '';
  let customerId = '';
  let secondId = '';

  beforeAll(async () => {
    const login = await api().post('/api/v1/auth/login').send({ phone: phoneA, password: 'R3set!Passw0rd' });
    customerToken = login.body.data.accessToken;
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${customerToken}`);
    customerId = me.body.data.id;

    const reg = await register(phoneB, `b${stamp}@example.com`);
    const meB = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    secondId = meB.body.data.id;
    createdIds.push(secondId);
  });

  it('blocks CUSTOMER from listing users', async () => {
    const res = await api().get('/api/v1/users').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('blocks CUSTOMER from disabling a user', async () => {
    const res = await api().patch(`/api/v1/users/${secondId}/status`)
      .set('Authorization', `Bearer ${customerToken}`).send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it('blocks anonymous access', async () => {
    const res = await api().get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('allows OWNER to list users with pagination meta', async () => {
    if (!ownerToken) return; // owner creds not provided in this environment
    const res = await api().get('/api/v1/users?page=1&limit=5').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    expect(res.body.data.meta).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.data.meta.total).toBeGreaterThan(0);
  });

  it('allows OWNER to disable then enable a user, revoking sessions', async () => {
    if (!ownerToken) return;
    const disable = await api().patch(`/api/v1/users/${secondId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ isActive: false });
    expect(disable.status).toBe(200);
    expect(disable.body.data.status).toBe('SUSPENDED');

    const login = await api().post('/api/v1/auth/login').send({ phone: phoneB, password: PASSWORD });
    expect(login.status).toBe(403);

    const enable = await api().patch(`/api/v1/users/${secondId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ isActive: true });
    expect(enable.status).toBe(200);
    expect(enable.body.data.status).toBe('ACTIVE');
  });

  it('never exposes password hashes in user listings', async () => {
    if (!ownerToken) return;
    const res = await api().get('/api/v1/users?limit=50').set('Authorization', `Bearer ${ownerToken}`);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');
  });
});
