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
  'brands.read': 'عرض العلامات التجارية',
  'brands.create': 'إضافة علامة تجارية',
  'brands.update': 'تعديل علامة تجارية',
  'brands.delete': 'حذف/تعطيل علامة تجارية',
  'specifications.read': 'عرض المواصفات',
  'specifications.create': 'إضافة تعريف مواصفة',
  'specifications.update': 'تعديل تعريف مواصفة',
  'specifications.delete': 'حذف/تعطيل تعريف مواصفة',
  'inventory.read': 'عرض المخزون',
  'inventory.update': 'تعديل إعدادات المخزون',
  'inventory.adjust': 'تعديل كميات المخزون',
  'payments.read': 'عرض المدفوعات',
  'payments.update': 'تعديل المدفوعات',
  'verification.read': 'عرض طلبات التحقق',
  'verification.update': 'مراجعة طلبات التحقق وتأكيدها',
  'analytics.read': 'عرض تحليلات لوحة التحكم',
  'notifications.admin.read': 'عرض إشعارات الإدارة',
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

  // --- Stage 4: minimal demo catalog (clearly-labelled test data, idempotent) ---
  const demoCategory = await prisma.category.upsert({
    where: { slug: 'demo-home-appliances' },
    update: {},
    create: { name: 'تصنيف تجريبي — أجهزة منزلية', slug: 'demo-home-appliances', sortOrder: 1 },
  });
  const demoChild = await prisma.category.upsert({
    where: { slug: 'demo-refrigerators' },
    update: {},
    create: {
      name: 'تصنيف تجريبي — ثلاجات', slug: 'demo-refrigerators',
      parentId: demoCategory.id, sortOrder: 1,
    },
  });
  const demoBrandA = await prisma.brand.upsert({
    where: { slug: 'demo-brand-a' }, update: {},
    create: { name: 'علامة تجريبية أ', slug: 'demo-brand-a', sortOrder: 1 },
  });
  const demoBrandB = await prisma.brand.upsert({
    where: { slug: 'demo-brand-b' }, update: {},
    create: { name: 'علامة تجريبية ب', slug: 'demo-brand-b', sortOrder: 2 },
  });

  const specSeeds = [
    { key: 'capacity', name: 'السعة', type: 'NUMBER' as const, unit: 'L', sortOrder: 1 },
    { key: 'color', name: 'اللون', type: 'SELECT' as const, options: ['أسود', 'أبيض', 'فضي'], sortOrder: 2 },
    { key: 'energy_class', name: 'صنف الطاقة', type: 'SELECT' as const, options: ['A+', 'A', 'B'], sortOrder: 3 },
    { key: 'no_frost', name: 'بدون ثلج (No Frost)', type: 'BOOLEAN' as const, sortOrder: 4 },
  ];
  for (const spec of specSeeds) {
    await prisma.specificationDefinition.upsert({
      where: { key: spec.key }, update: { name: spec.name, type: spec.type, unit: spec.unit ?? null, options: spec.options ?? [], sortOrder: spec.sortOrder },
      create: { key: spec.key, name: spec.name, type: spec.type, unit: spec.unit ?? null, options: spec.options ?? [], sortOrder: spec.sortOrder },
    });
  }

  const productsSeed = [
    { sku: 'DEMO-REF-001', slug: 'demo-refrigerator-500l', name: 'منتج تجريبي — ثلاجة 500 لتر', price: '500.00', compareAtPrice: '600.00', brandId: demoBrandA.id, isFeatured: true },
    { sku: 'DEMO-REF-002', slug: 'demo-refrigerator-300l', name: 'منتج تجريبي — ثلاجة 300 لتر', price: '350.00', compareAtPrice: null, brandId: demoBrandB.id, isFeatured: false },
  ];
  for (const item of productsSeed) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {},
      create: {
        name: item.name, slug: item.slug, sku: item.sku,
        shortDescription: 'بيانات اختبارية للتحقق من العلاقات فقط',
        price: item.price, compareAtPrice: item.compareAtPrice ?? null,
        brandId: item.brandId, categoryId: demoChild.id, isActive: true, isFeatured: item.isFeatured,
      },
    });
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id, quantity: 12, reservedQuantity: 0, lowStockThreshold: 5 },
    });
  }

  console.log(
    `Seed done: roles=${roles} (custom=${customRoles}) permissions=${permissions} users=${users} ` +
    `categories=2 brands=2 products=${productsSeed.length} specs=${specSeeds.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
