# Alwled — Backend Foundation (المرحلة 1)

Backend متجر الأجهزة الكهربائية "alwled" — أساس البنية فقط (Users/Roles/Permissions + Auth).
Node.js + TypeScript strict + NestJS + PostgreSQL + Prisma + JWT + Swagger + Docker.

## التشغيل المحلي
```bash
cp .env.example .env       # ثم عدّل القيم
npm install
npx prisma migrate dev     # ترحيلات
npx prisma db seed         # OWNER من SEED_OWNER_* بيئياً
npm run start:dev          # وضع التطوير
```

## الجاهزية السريعة
- Health: `GET /api/v1/health`
- Swagger: `/api/docs`
- Auth: `/api/v1/auth/register` · `/login` · `/refresh` · `GET /me`
- أدوار (محمي بـ dashboard.read): `GET /api/v1/roles` · `GET /api/v1/permissions`

## متغيرات البيئة
DATABASE_URL، JWT_SECRET، JWT_EXPIRES_IN، JWT_REFRESH_EXPIRES_IN، PORT، NODE_ENV،
CORS_ORIGINS، SEED_OWNER_PHONE، SEED_OWNER_PASSWORD (لا تُخزّن بكود).

## Docker (dev)
```bash
docker compose up -d       # postgres + backend
```

## قرار معماري
- Roles عبر جدول + UserRole N:M ⇒ المستخدم قد يملك أكثر من Role مستقبلاً بلا تغيير Schema.
- Permissions بالمفتاح (products.create...) عبر RolePermission ⇒ تعديل صلاحيات موظف من DB دون كود.
- JWT Access 15m + Refresh Token مخزّن هاش مدار (دورة REVOKED/USED) مع دوران عند الشراء.
- الاستجابة الموحدة `{success, message, data|errors}` عبر Filter + Interceptor عامين.
- Guards عامة: Throttler ⇒ JwtAuthGuard(يحترم @Public) ⇒ RolesGuard ⇒ PermissionsGuard.
-passwordHash لا يُرجع أبداً (select يدوي حصري).
