import { PrismaClient } from '@prisma/client';
import * as argon from 'argon2';
import {
  PERMISSION_KEYS,
  ROLE_PERMISSION_MATRIX,
  SYSTEM_ROLES,
} from '../src/common/constants';

const prisma = new PrismaClient();

const PERMISSION_LABELS: Record<string, string> = {
  '*': 'كل الصلاحيات (المالك)',
  'dashboard.read': 'عرض لوحة التحكم',
  'products.read': 'عرض المنتجات',
  'products.create': 'إضافة منتج',
  'products.update': 'تعديل منتج',
  'products.delete': 'حذف منتج',
  'categories.read': 'عرض التصنيفات',
  'categories.create': 'إضافة تصنيف',
  'categories.update': 'تعديل تصنيف',
  'categories.delete': 'حذف تصنيف',
  'orders.read': 'عرض الطلبات',
  'orders.create': 'إنشاء طلب',
  'orders.update': 'تعديل طلب',
  'orders.cancel': 'إلغاء طلب',
  'customers.read': 'عرض الزبائن',
  'customers.update': 'تعديل الزبائن',
  'employees.read': 'عرض الموظفين',
  'employees.create': 'إضافة موظف',
  'employees.update': 'تعديل موظف',
  'employees.delete': 'حذف موظف',
  'users.read': 'عرض المستخدمين',
  'users.update': 'تعديل حالة المستخدمين',
  'roles.read': 'عرض الأدوار',
  'roles.create': 'إنشاء دور',
  'roles.update': 'تعديل دور أو صلاحياته',
  'roles.delete': 'حذف دور',
  'permissions.read': 'عرض الصلاحيات',
  'payments.read': 'عرض المدفوعات',
  'payments.update': 'تعديل المدفوعات',
  'audit.read': 'عرض سجل التدقيق',
};

async function main() {
  // --- permissions (idempotent upsert) ---
  const keyToId = new Map<string, number>();
  for (const keys of Object.values(PERMISSION_KEYS)) {
    for (const key of keys) {
      const group = key === '*' ? 'system' : key.split('.')[0];
      const permission = await prisma.permission.upsert({
        where: { key },
        update: { group, name: PERMISSION_LABELS[key] ?? key },
        create: { key, group, name: PERMISSION_LABELS[key] ?? key },
      });
      keyToId.set(key, permission.id);
    }
  }

  // --- system roles + role_permissions (DB is the runtime source of truth) ---
  for (const name of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { isSystem: true },
      create: { name, isSystem: true },
    });
    const granted = ROLE_PERMISSION_MATRIX[name] ?? [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: granted
        .map((key) => keyToId.get(key))
        .filter((id): id is number => typeof id === 'number')
        .map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }

  // --- owner from env (no credentials in git) ---
  const phone = process.env.SEED_OWNER_PHONE;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (phone && password) {
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'OWNER' } });
    const passwordHash = await argon.hash(password);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone }, ...(process.env.SEED_OWNER_EMAIL ? [{ email: process.env.SEED_OWNER_EMAIL }] : [])] },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, isVerified: true, status: 'ACTIVE' },
      });
      const hasOwner = await prisma.userRole.findFirst({
        where: { userId: existing.id, roleId: ownerRole.id },
      });
      if (!hasOwner) {
        await prisma.userRole.create({ data: { userId: existing.id, roleId: ownerRole.id } });
      }
      console.log(`Owner updated: ${phone}`);
    } else {
      await prisma.user.create({
        data: {
          firstName: 'Owner',
          lastName: 'Alwled',
          phone,
          email: process.env.SEED_OWNER_EMAIL || null,
          passwordHash,
          roles: { create: [{ roleId: ownerRole.id }] },
          isVerified: true,
        },
      });
      console.log(`Owner seeded: ${phone}`);
    }
  } else {
    console.warn('SEED_OWNER_PHONE / SEED_OWNER_PASSWORD not set — owner NOT created');
  }

  const [roles, customRoles, permissions, users] = await Promise.all([
    prisma.role.count(),
    prisma.role.count({ where: { isSystem: false } }),
    prisma.permission.count(),
    prisma.user.count(),
  ]);
  console.log(
    `Seed done: roles=${roles} (custom=${customRoles}) permissions=${permissions} users=${users}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
