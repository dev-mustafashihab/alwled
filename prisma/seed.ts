import { PrismaClient, RoleName } from '@prisma/client';
import * as argon from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = {
  dashboard: ['dashboard.read'],
  products: ['products.read', 'products.create', 'products.update', 'products.delete'],
  orders: ['orders.read', 'orders.update'],
  customers: ['customers.read', 'customers.update'],
  employees: ['employees.read', 'employees.create', 'employees.update', 'employees.delete'],
};

const ROLE_MAP: Record<RoleName, string[]> = {
  OWNER: ['*'],
  ADMIN: [
    ...PERMISSIONS.dashboard,
    'products.read', 'products.create', 'products.update',
    'orders.read', 'orders.update',
    'customers.read', 'customers.update',
    'employees.read',
  ],
  EMPLOYEE: ['products.read', 'orders.read', 'orders.update', 'customers.read'],
  CUSTOMER: [],
};

async function main() {
  // --- permissions ---
  const keyToId = new Map<string, number>();
  for (const [group, keys] of Object.entries(PERMISSIONS)) {
    for (const key of keys) {
      const p = await prisma.permission.upsert({
        where: { key },
        update: { group },
        create: {
          key,
          group,
          name:
            group === 'dashboard' ? 'عرض لوحة التحكم' :
            group === 'products' ? 'إدارة المنتجات' :
            group === 'orders' ? 'إدارة الطلبات' :
            group === 'customers' ? 'إدارة الزبائن' : 'إدارة الموظفين',
        },
      });
      keyToId.set(key, p.id);
    }
  }

  // --- roles ---
  for (const [name, keys] of Object.entries(ROLE_MAP)) {
    const role = await prisma.role.upsert({
      where: { name: name as RoleName },
      update: {},
      create: { name: name as RoleName, isSystem: true },
    });
    if (keys[0] === '*') {
      // OWNER keeps wildcard marker in code; DB grants all current keys
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: [...keyToId.values()].map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    } else {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: keys.map((key) => ({ roleId: role.id, permissionId: keyToId.get(key)! })),
      });
    }
  }

  // --- owner from env (no hardcoded secrets) ---
  const phone = process.env.SEED_OWNER_PHONE;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (phone && password) {
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'OWNER' } });
    const passwordHash = await argon.hash(password);
    await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        firstName: 'Owner',
        lastName: 'Alwled',
        phone,
        passwordHash,
        roles: { create: [{ roleId: ownerRole.id }] },
        isVerified: true,
      },
    });
    console.log(`Owner seeded: ${phone}`);
  } else {
    console.warn('SEED_OWNER_PHONE / SEED_OWNER_PASSWORD not set — owner NOT created');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
