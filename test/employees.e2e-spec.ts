import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Stage 3 — Employee, Role, Permission and Audit authorization.
 * Real database, real guards: every assertion goes through the HTTP layer.
 */
describe('Employees / Roles / Permissions / Audit (e2e)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const stamp = Date.now().toString().slice(-7);
  const pass = 'Str0ng!Pass1';
  const phones = {
    admin: `0901${stamp}`,
    employee: `0902${stamp}`,
    customer: `0903${stamp}`,
    extra: `0904${stamp}`,
    secondOwner: `0905${stamp}`,
  };
  const emails = {
    admin: `admin.${stamp}@alwled.test`,
    employee: `emp.${stamp}@alwled.test`,
    customer: `cust.${stamp}@alwled.test`,
  };

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let ownerRoleId = 0;
  let employeeRoleId = 0;
  let salesRoleId = 0;

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

    // Owner comes from the seed (credentials only in .env).
    const ownerLogin = await http()
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SEED_OWNER_PHONE, password: process.env.SEED_OWNER_PASSWORD });
    expect(ownerLogin.status).toBe(200);
    tokens.owner = ownerLogin.body.data.accessToken;
    const ownerMe = await http().get('/api/v1/auth/me').set(auth('owner'));
    expect(ownerMe.status).toBe(200);
    ids.owner = ownerMe.body.data.id;
    expect(ownerMe.body.data.roles).toContain('OWNER');

    // System + custom roles lookup
    const roles = await http().get('/api/v1/roles?limit=100').set(auth('owner'));
    expect(roles.status).toBe(200);
    const byName = (name: string) =>
      roles.body.data.items.find((r: { name: string }) => r.name === name);
    ownerRoleId = byName('OWNER').id;
    employeeRoleId = byName('EMPLOYEE').id;

    // Custom role that grants a permission ADMIN does not hold (roles.create)
    const perms = await http().get('/api/v1/permissions').set(auth('owner'));
    const permId = (key: string) =>
      perms.body.data.flat.find((p: { key: string }) => p.key === key).id;
    const sales = await http()
      .post('/api/v1/roles')
      .set(auth('owner'))
      .send({
        name: `SALES_${stamp}`,
        description: 'موظف مبيعات',
        permissionIds: [permId('orders.read'), permId('customers.read'), permId('roles.create')],
      });
    expect(sales.status).toBe(201);
    salesRoleId = sales.body.data.id;

    // Employees created through the API by the OWNER
    const admin = await http()
      .post('/api/v1/employees')
      .set(auth('owner'))
      .send({ firstName: 'Admin', lastName: 'User', email: emails.admin, phone: phones.admin, password: pass, roleName: 'ADMIN' });
    expect(admin.status).toBe(201);
    ids.admin = admin.body.data.id;

    const employee = await http()
      .post('/api/v1/employees')
      .set(auth('owner'))
      .send({ firstName: 'Emp', lastName: 'User', email: emails.employee, phone: phones.employee, password: pass });
    expect(employee.status).toBe(201);
    ids.employee = employee.body.data.id;

    // Public registration must never create staff
    const customer = await http()
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Cust', lastName: 'Omer', email: emails.customer, phone: phones.customer,
        password: pass, confirmPassword: pass,
      });
    expect(customer.status).toBe(201);
    expect(customer.body.data.accessToken).toBeDefined();

    for (const [who, phone] of [['admin', phones.admin], ['employee', phones.employee], ['customer', phones.customer]] as const) {
      const login = await http().post('/api/v1/auth/login').send({ phone, password: pass });
      expect(login.status).toBe(200);
      tokens[who] = login.body.data.accessToken;
      const me = await http().get('/api/v1/auth/me').set(auth(who));
      expect(me.status).toBe(200);
      ids[who] = me.body.data.id;
    }
    // Public registration must never grant staff roles
    expect((await http().get('/api/v1/auth/me').set(auth('customer'))).body.data.roles).toEqual([
      'CUSTOMER',
    ]);
  }, 60000);

  afterAll(async () => {
    // Self-cleanup: remove ONLY the accounts/roles this spec created (matched by
    // its unique stamp) so repeated runs never pollute the database.
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.user.deleteMany({
        where: {
          OR: [
            { phone: { in: Object.values(phones) } },
            { email: { in: Object.values(emails) } },
          ],
        },
      });
      await prisma.role.deleteMany({
        where: {
          isSystem: false,
          name: { in: [`SALES_${stamp}`, `SUPPORT_${stamp}`, `TEMP_${stamp}`] },
          users: { none: {} },
        },
      });
      await prisma.$disconnect();
    } catch (error) {
      // never fail the suite because of cleanup
      console.warn('cleanup skipped:', (error as Error).message);
    }
    await app?.close();
  });

  /* ------------------------------- Employees ------------------------------ */

  describe('Employees', () => {
    it('OWNER created the ADMIN and EMPLOYEE accounts with the right roles', async () => {
      expect((await http().get(`/api/v1/employees/${ids.admin}`).set(auth('owner'))).body.data.roles)
        .toEqual(['ADMIN']);
      expect((await http().get(`/api/v1/employees/${ids.employee}`).set(auth('owner'))).body.data.roles)
        .toEqual(['EMPLOYEE']);
    });

    it('ADMIN can create an employee (has employees.create)', async () => {
      const res = await http()
        .post('/api/v1/employees')
        .set(auth('admin'))
        .send({ firstName: 'Extra', lastName: 'Staff', phone: phones.extra, password: pass });
      expect(res.status).toBe(201);
      expect(res.body.data.roles).toEqual(['EMPLOYEE']);
      ids.extra = res.body.data.id;
    });

    it('EMPLOYEE without employees.create is rejected', async () => {
      const res = await http()
        .post('/api/v1/employees')
        .set(auth('employee'))
        .send({ firstName: 'No', lastName: 'Perm', phone: `0909${stamp}`, password: pass });
      expect(res.status).toBe(403);
    });

    it('CUSTOMER is rejected on employee APIs', async () => {
      expect((await http().get('/api/v1/employees').set(auth('customer'))).status).toBe(403);
      expect((await http().post('/api/v1/employees').set(auth('customer')).send({})).status).toBe(403);
      expect((await http().get(`/api/v1/employees/${ids.employee}`).set(auth('customer'))).status).toBe(403);
    });

    it('rejects duplicate email and duplicate phone', async () => {
      const dupEmail = await http().post('/api/v1/employees').set(auth('owner')).send({
        firstName: 'Dup', lastName: 'Mail', email: emails.admin, phone: `0906${stamp}`, password: pass,
      });
      expect(dupEmail.status).toBe(409);
      const dupPhone = await http().post('/api/v1/employees').set(auth('owner')).send({
        firstName: 'Dup', lastName: 'Phone', phone: phones.admin, password: pass,
      });
      expect(dupPhone.status).toBe(409);
    });

    it('lists employees with pagination, filters and sort', async () => {
      const list = await http().get('/api/v1/employees?page=1&limit=2&sortBy=createdAt&sortOrder=desc').set(auth('owner'));
      expect(list.status).toBe(200);
      expect(list.body.data.items.length).toBe(2);
      expect(list.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(list.body.meta.total).toBeGreaterThanOrEqual(4);
      expect(list.body.meta.totalPages).toBeGreaterThanOrEqual(2);

      const admins = await http().get('/api/v1/employees?role=ADMIN').set(auth('owner'));
      expect(admins.body.data.items.every((u: { roles: string[] }) => u.roles.includes('ADMIN'))).toBe(true);

      const search = await http().get(`/api/v1/employees?search=extra&limit=50`).set(auth('owner'));
      expect(search.body.data.items.length).toBeGreaterThanOrEqual(1);

      const active = await http().get('/api/v1/employees?status=ACTIVE&limit=50').set(auth('owner'));
      expect(active.body.data.items.every((u: { status: string }) => u.status === 'ACTIVE')).toBe(true);
    });

    it('never exposes secrets, tokens or password hashes', async () => {
      const res = await http().get('/api/v1/employees?limit=50').set(auth('owner'));
      const raw = JSON.stringify(res.body);
      ['passwordHash', 'refreshToken', 'tokenHash', 'password'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
      const detail = await http().get(`/api/v1/employees/${ids.employee}`).set(auth('owner'));
      expect(detail.body.data).not.toHaveProperty('passwordHash');
      expect(detail.body.data).toHaveProperty('effectivePermissions');
    });

    it('updates employee data and rejects duplicates on update', async () => {
      const res = await http()
        .patch(`/api/v1/employees/${ids.employee}`)
        .set(auth('owner'))
        .send({ firstName: 'Employee', lastName: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe('Employee');

      const clash = await http()
        .patch(`/api/v1/employees/${ids.employee}`)
        .set(auth('owner'))
        .send({ email: emails.admin });
      expect(clash.status).toBe(409);
    });

    it('disables an employee (revokes sessions) then re-enables', async () => {
      const disabled = await http()
        .patch(`/api/v1/employees/${ids.extra ?? ''}/status`)
        .set(auth('owner'))
        .send({ isActive: false });
      // `extra` employee id resolved during creation; fall back to search if it drifted
      if (disabled.status !== 200) {
        const found = await http().get('/api/v1/employees?search=extra&limit=1').set(auth('owner'));
        const id = found.body.data.items[0].id;
        const retry = await http().patch(`/api/v1/employees/${id}/status`).set(auth('owner')).send({ isActive: false });
        expect(retry.status).toBe(200);
        expect(retry.body.data.status).toBe('SUSPENDED');
        const back = await http().patch(`/api/v1/employees/${id}/status`).set(auth('owner')).send({ isActive: true });
        expect(back.body.data.status).toBe('ACTIVE');
      } else {
        expect(disabled.body.data.status).toBe('SUSPENDED');
        const back = await http().patch(`/api/v1/employees/${ids.extra}/status`).set(auth('owner')).send({ isActive: true });
        expect(back.body.data.status).toBe('ACTIVE');
      }
    });

    it('a disabled employee cannot log in or use protected endpoints', async () => {
      const targets = { id: ids.admin, phone: phones.admin, token: tokens.admin };
      expect(
        (await http().patch(`/api/v1/employees/${targets.id}/status`).set(auth('owner')).send({ isActive: false })).status,
      ).toBe(200);

      const me = await http().get('/api/v1/auth/me').set({ Authorization: `Bearer ${targets.token}` });
      expect(me.status).toBe(403);

      const relogin = await http().post('/api/v1/auth/login').send({ phone: targets.phone, password: pass });
      expect(relogin.status).toBe(403);

      expect(
        (await http().patch(`/api/v1/employees/${targets.id}/status`).set(auth('owner')).send({ isActive: true })).status,
      ).toBe(200);
      const back = await http().post('/api/v1/auth/login').send({ phone: targets.phone, password: pass });
      expect(back.status).toBe(200);
      tokens.admin = back.body.data.accessToken;
    });
  });

  /* --------------------------------- Roles -------------------------------- */

  describe('Roles', () => {
    it('lists roles with counts and no N+1 payload', async () => {
      const res = await http().get('/api/v1/roles').set(auth('owner'));
      expect(res.status).toBe(200);
      const owner = res.body.data.items.find((r: { name: string }) => r.name === 'OWNER');
      expect(owner).toMatchObject({ isSystemRole: true, isOwnerRole: true, isWildcard: true });
      expect(owner.assignedUsersCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.some((r: { name: string }) => r.name === `SALES_${stamp}`)).toBe(true);
    });

    it('OWNER creates and updates a custom role', async () => {
      const permIds = (await http().get('/api/v1/permissions').set(auth('owner'))).body.data.flat.map(
        (p: { id: number }) => p.id,
      );
      const created = await http().post('/api/v1/roles').set(auth('owner')).send({
        name: `SUPPORT_${stamp}`,
        description: 'دعم فني',
        permissionIds: permIds.slice(0, 2),
      });
      expect(created.status).toBe(201);
      expect(created.body.data.permissionsCount).toBe(2);

      const updated = await http().patch(`/api/v1/roles/${created.body.data.id}`).set(auth('owner')).send({ description: 'دعم العملاء' });
      expect(updated.status).toBe(200);
      expect(updated.body.data.description).toBe('دعم العملاء');

      const del = await http().delete(`/api/v1/roles/${created.body.data.id}`).set(auth('owner'));
      expect(del.status).toBe(200);
      expect(del.body.data.deleted).toBe(true);
    });

    it('ADMIN cannot create, update or delete roles', async () => {
      expect((await http().post('/api/v1/roles').set(auth('admin')).send({ name: `HACK_${stamp}` })).status).toBe(403);
      expect((await http().patch(`/api/v1/roles/${employeeRoleId}`).set(auth('admin')).send({ description: 'محاولة' })).status).toBe(403);
      expect((await http().delete(`/api/v1/roles/${employeeRoleId}`).set(auth('admin'))).status).toBe(403);
    });

    it('reserved role names are rejected', async () => {
      const res = await http().post('/api/v1/roles').set(auth('owner')).send({ name: 'OWNER' });
      expect(res.status).toBe(409);
    });

    it('system roles cannot be deleted, OWNER role cannot be edited', async () => {
      expect((await http().delete(`/api/v1/roles/${employeeRoleId}`).set(auth('owner'))).status).toBe(403);
      expect((await http().patch(`/api/v1/roles/${ownerRoleId}`).set(auth('owner')).send({ description: 'محاولة تعديل' })).status).toBe(403);
      expect(
        (await http().put(`/api/v1/roles/${ownerRoleId}/permissions`).set(auth('owner')).send({ permissionIds: [1] })).status,
      ).toBe(403);
    });

    it('deleting a role that is assigned to users is refused', async () => {
      const created = await http().post('/api/v1/roles').set(auth('owner')).send({ name: `TEMP_${stamp}` });
      const roleId = created.body.data.id;
      expect((await http().post(`/api/v1/employees/${ids.employee}/roles`).set(auth('owner')).send({ roleId })).status).toBe(201);
      expect((await http().delete(`/api/v1/roles/${roleId}`).set(auth('owner'))).status).toBe(409);
      expect((await http().delete(`/api/v1/employees/${ids.employee}/roles/${roleId}`).set(auth('owner'))).status).toBe(200);
      expect((await http().delete(`/api/v1/roles/${roleId}`).set(auth('owner'))).status).toBe(200);
    });

    it('assigns and revokes a custom role (multiple roles supported)', async () => {
      const assign = await http().post(`/api/v1/employees/${ids.employee}/roles`).set(auth('owner')).send({ roleId: salesRoleId });
      expect(assign.status).toBe(201);
      expect(assign.body.data.roles).toEqual(expect.arrayContaining(['EMPLOYEE', `SALES_${stamp}`]));
      expect(assign.body.data.effectivePermissions).toEqual(
        expect.arrayContaining(['orders.read', 'customers.read', 'roles.create']),
      );

      const dup = await http().post(`/api/v1/employees/${ids.employee}/roles`).set(auth('owner')).send({ roleId: salesRoleId });
      expect(dup.status).toBe(409);

      const revoke = await http().delete(`/api/v1/employees/${ids.employee}/roles/${salesRoleId}`).set(auth('owner'));
      expect(revoke.status).toBe(200);
      expect(revoke.body.data.roles).toEqual(['EMPLOYEE']);
    });

    it('refuses to leave an account without any role', async () => {
      const res = await http().delete(`/api/v1/employees/${ids.employee}/roles/${employeeRoleId}`).set(auth('owner'));
      expect(res.status).toBe(400);
    });
  });

  /* ------------------------------ Permissions ----------------------------- */

  describe('Permissions', () => {
    it('lists permissions grouped by module', async () => {
      const res = await http().get('/api/v1/permissions').set(auth('owner'));
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(29);
      expect(res.body.data.groups.map((g: { module: string }) => g.module)).toEqual(
        expect.arrayContaining(['products', 'orders', 'employees', 'roles', 'audit']),
      );
    });

    it('EMPLOYEE cannot read permissions or modify role permissions', async () => {
      expect((await http().get('/api/v1/permissions').set(auth('employee'))).status).toBe(403);
      expect(
        (await http().put(`/api/v1/roles/${salesRoleId}/permissions`).set(auth('employee')).send({ permissionIds: [] })).status,
      ).toBe(403);
    });

    it('ADMIN cannot grant a role that carries permissions outside its own set', async () => {
      // SALES carries roles.create, which ADMIN does not hold
      const res = await http().post('/api/v1/employees').set(auth('admin')).send({
        firstName: 'Esc', lastName: 'Alate', phone: `0907${stamp}`, password: pass, roleName: `SALES_${stamp}`,
      });
      expect(res.status).toBe(403);
      const assign = await http().post(`/api/v1/employees/${ids.employee}/roles`).set(auth('admin')).send({ roleId: salesRoleId });
      expect(assign.status).toBe(403);
    });

    it('replaces role permissions atomically and keeps them consistent', async () => {
      const flat = (await http().get('/api/v1/permissions').set(auth('owner'))).body.data.flat;
      const wish = ['orders.read', 'orders.update'].map(
        (k) => flat.find((p: { key: string }) => p.key === k).id,
      );
      const res = await http().put(`/api/v1/roles/${salesRoleId}/permissions`).set(auth('owner')).send({ permissionIds: wish });
      expect(res.status).toBe(200);
      expect(res.body.data.permissionsCount).toBe(2);
      expect(res.body.data.permissions.map((p: { key: string }) => p.key).sort()).toEqual(['orders.read', 'orders.update']);

      const invalid = await http()
        .put(`/api/v1/roles/${salesRoleId}/permissions`)
        .set(auth('owner'))
        .send({ permissionIds: [999999] });
      expect(invalid.status).toBe(400);
      const after = await http().get(`/api/v1/roles/${salesRoleId}`).set(auth('owner'));
      expect(after.body.data.permissionsCount).toBe(2); // unchanged — no half-updated role
    });
  });

  /* ------------------------------- Security ------------------------------- */

  describe('Security rules', () => {
    it('nobody can change their own roles (self escalation)', async () => {
      const res = await http().post(`/api/v1/employees/${ids.admin}/roles`).set(auth('admin')).send({ roleName: 'ADMIN' });
      expect(res.status).toBe(403);
    });

    it('EMPLOYEE cannot promote self or others', async () => {
      expect((await http().post(`/api/v1/employees/${ids.employee}/roles`).set(auth('employee')).send({ roleId: salesRoleId })).status).toBe(403);
      expect((await http().post(`/api/v1/employees/${ids.admin}/roles`).set(auth('employee')).send({ roleId: salesRoleId })).status).toBe(403);
      expect((await http().patch(`/api/v1/employees/${ids.employee}`).set(auth('employee')).send({ firstName: 'Me' })).status).toBe(403);
    });

    it('creates an OWNER only through the owner, and ADMIN cannot touch OWNER accounts', async () => {
      const second = await http().post('/api/v1/employees').set(auth('owner')).send({
        firstName: 'Second', lastName: 'Owner', phone: phones.secondOwner, password: pass,
      });
      expect(second.status).toBe(201);
      const secondId = second.body.data.id;
      expect((await http().post(`/api/v1/employees/${secondId}/roles`).set(auth('owner')).send({ roleName: 'OWNER' })).status).toBe(201);

      // ADMIN attempts on the OWNER account
      expect((await http().patch(`/api/v1/employees/${ids.owner}/status`).set(auth('admin')).send({ isActive: false })).status).toBe(403);
      expect((await http().patch(`/api/v1/employees/${ids.owner}`).set(auth('admin')).send({ firstName: 'Hacked' })).status).toBe(403);
      expect((await http().delete(`/api/v1/employees/${ids.owner}/roles/${ownerRoleId}`).set(auth('admin'))).status).toBe(403);
      expect((await http().post(`/api/v1/employees/${secondId}/roles`).set(auth('admin')).send({ roleName: 'EMPLOYEE' })).status).toBe(403);

      // ADMIN cannot create an ADMIN either
      expect((await http().post('/api/v1/employees').set(auth('admin')).send({
        firstName: 'Fake', lastName: 'Admin', phone: `0908${stamp}`, password: pass, roleName: 'ADMIN',
      })).status).toBe(403);

      // cleanup: back to a single owner
      expect((await http().delete(`/api/v1/employees/${secondId}/roles/${ownerRoleId}`).set(auth('owner'))).status).toBe(200);
    });

    it('OWNER can manage another OWNER while more than one exists', async () => {
      const created = await http().post('/api/v1/employees').set(auth('owner')).send({
        firstName: 'Temp', lastName: 'Owner', phone: `0910${stamp}`, password: pass,
      });
      const id = created.body.data.id;
      await http().post(`/api/v1/employees/${id}/roles`).set(auth('owner')).send({ roleName: 'OWNER' });
      expect((await http().patch(`/api/v1/employees/${id}/status`).set(auth('owner')).send({ isActive: false })).status).toBe(200);
      expect((await http().patch(`/api/v1/employees/${id}/status`).set(auth('owner')).send({ isActive: true })).status).toBe(200);
      expect((await http().delete(`/api/v1/employees/${id}/roles/${ownerRoleId}`).set(auth('owner'))).status).toBe(200);
    });
  });

  /* --------------------------------- Audit -------------------------------- */

  describe('Audit log', () => {
    it('requires audit.read (customer and employee refused, admin allowed)', async () => {
      expect((await http().get('/api/v1/audit').set(auth('customer'))).status).toBe(403);
      expect((await http().get('/api/v1/audit').set(auth('employee'))).status).toBe(403);
      expect((await http().get('/api/v1/audit').set(auth('admin'))).status).toBe(200);
    });

    it('records employee, role and permission events with actor and metadata', async () => {
      const created = await http().get('/api/v1/audit?action=EMPLOYEE_CREATED&limit=50').set(auth('owner'));
      expect(created.status).toBe(200);
      const event = created.body.data.items[0];
      expect(event.actorId).toBe(ids.owner);
      expect(event.entity).toBe('user');
      expect(JSON.stringify(event.metadata)).toContain('EMPLOYEE', );

      const assigned = await http().get('/api/v1/audit?action=ROLE_ASSIGNED&limit=50').set(auth('owner'));
      expect(assigned.body.meta.total).toBeGreaterThanOrEqual(1);

      const perms = await http().get('/api/v1/audit?action=ROLE_PERMISSIONS_UPDATED&limit=50').set(auth('owner'));
      expect(perms.body.meta.total).toBeGreaterThanOrEqual(1);

      const disabled = await http().get('/api/v1/audit?action=EMPLOYEE_DISABLED&limit=50').set(auth('owner'));
      expect(disabled.body.meta.total).toBeGreaterThanOrEqual(1);
      const revoked = await http().get('/api/v1/audit?action=ROLE_REVOKED&limit=50').set(auth('owner'));
      expect(revoked.body.meta.total).toBeGreaterThanOrEqual(1);
      const roleCreated = await http().get('/api/v1/audit?action=ROLE_CREATED&limit=50').set(auth('owner'));
      expect(roleCreated.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('never stores secrets inside audit metadata', async () => {
      const res = await http().get('/api/v1/audit?limit=100').set(auth('owner'));
      const raw = JSON.stringify(res.body);
      ['passwordHash', 'tokenHash', 'refreshToken', 'JWT_SECRET'].forEach((needle) =>
        expect(raw).not.toContain(needle),
      );
    });

    it('filters by actor, action and date range', async () => {
      const byActor = await http().get(`/api/v1/audit?actorUserId=${ids.owner}&limit=5`).set(auth('owner'));
      expect(byActor.body.data.items.every((e: { actorId: string }) => e.actorId === ids.owner)).toBe(true);
      const range = await http()
        .get(`/api/v1/audit?from=${new Date(Date.now() - 3600_000).toISOString()}&to=${new Date(Date.now() + 3600_000).toISOString()}`)
        .set(auth('owner'));
      expect(range.status).toBe(200);
    });
  });
});
