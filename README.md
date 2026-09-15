# Alwled — Backend (متجر الأجهزة الكهربائية)

Node.js + TypeScript (strict) + NestJS + PostgreSQL + Prisma + JWT + Argon2 + Docker + Swagger.

> **المرحلة 1:** أساس البنية (Users/Roles/Permissions + JWT + Guards + Swagger + Health).
> **المرحلة 2:** دورة حساب كاملة (Sessions/Logout/Change-Forgot-Reset Password/Verification foundation + User Management + Audit foundation).
> **المرحلة 3:** إدارة الموظفين والأدوار والصلاحيات + Effective Permissions + سجل تدقيق قابل للقراءة + قواعد حماية صارمة (Owner/Privilege escalation/Last owner).

## التشغيل

```bash
npm install
cp .env.example .env          # ثم املأ القيم (لا أسرار في الكود)
npx prisma migrate deploy
npx prisma db seed            # أدوار + صلاحيات (+ المالك من متغيرات البيئة)
npm run start:dev             # http://localhost:3100
```

- Swagger: `http://localhost:3100/api/docs`
- Health: `GET /api/v1/health`
- الاختبارات: `npm test` (وحدوية) و`npm run test:e2e` (قاعدة بيانات حقيقية)

## نموذج الصلاحيات (Permissions)

```
User ──< UserRole >── Role ──< RolePermission >── Permission
```

- **Effective Permissions** = اتحاد صلاحيات كل أدوار المستخدم، ويُحسب في `JwtStrategy` مع كل طلب
  (تعديل الأدوار أو الصلاحيات يسري فوراً بدون انتظار انتهاء التوكن).
- دور **OWNER** يحمل `*` (wildcard) فيمر من كل بوابة صلاحيات.
- **أدوار مخصصة** (SALES, PRODUCT_MANAGER, SUPPORT, ACCOUNTANT...) تُنشأ عبر API بدون أي Migration
  لأن `roles.name` نص حر، مع `isSystem` لحماية الأدوار الأساسية.
- بوابة واحدة فقط للتفويض: `PermissionsGuard` + `@Permissions({ any | all })` — لا يوجد نظام ثانٍ.

### الأدوار النظامية

| الدور | ملاحظات |
| --- | --- |
| OWNER | wildcard، لا يُعدَّل ولا تُعدَّل صلاحياته، ولا يمكن حذف حسابه أو تعطيله من غيره |
| ADMIN | يدير المنتجات/الطلبات/الموظفين — بدون صلاحيات الأدوار أو حذف الموظفين |
| EMPLOYEE | صلاحيات تشغيلية محدودة |
| CUSTOMER | مستخدم المتجر — بلا أي وصول للواجهات الإدارية |

## Endpoints (v1)

### Auth (المرحلة 2)
`POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` ·
`POST /auth/refresh` · `GET /auth/sessions` · `GET /auth/me` · `PATCH /users/me` ·
`POST /auth/change-password` · `POST /auth/forgot-password` · `POST /auth/reset-password` ·
`POST /auth/resend-verification` · `POST /auth/verify-account`

### Employees (المرحلة 3)
| Method | Path | الصلاحية |
| --- | --- | --- |
| POST | `/employees` | `employees.create` |
| GET | `/employees` | `employees.read` |
| GET | `/employees/:id` | `employees.read` |
| PATCH | `/employees/:id` | `employees.update` |
| PATCH | `/employees/:id/status` | `employees.update` |
| POST | `/employees/:id/roles` | `employees.update` |
| DELETE | `/employees/:id/roles/:roleId` | `employees.update` |

- `GET /employees?page=&limit=&search=&role=&status=&isVerified=&sortBy=&sortOrder=`
  والرد يحتوي `data.items` + `meta { page, limit, total, totalPages }`.
- `GET /employees/:id` يعيد `roles`, `effectivePermissions`, `activeSessions` — بدون أي أسرار.

### Roles & Permissions (المرحلة 3)
| Method | Path | الصلاحية |
| --- | --- | --- |
| GET | `/roles` · `/roles/:id` | `roles.read` |
| POST | `/roles` | `roles.create` |
| PATCH | `/roles/:id` | `roles.update` |
| DELETE | `/roles/:id` | `roles.delete` |
| PUT | `/roles/:id/permissions` | `roles.update` |
| GET | `/permissions` | `permissions.read` |

### Audit (المرحلة 3)
`GET /audit?page=&limit=&action=&actorUserId=&targetUserId=&from=&to=` — يتطلب `audit.read`.

## قواعد الحماية (Security rules)

1. **Owner غير قابل للمس**: لا ADMIN ولا EMPLOYEE ولا CUSTOMER يستطيع تعديل بيانات المالك أو
   تعطيله أو تغيير أدواره أو صلاحياته.
2. **لا تصعيد صلاحيات ذاتي**: تعديل أدوار النفس مرفوض، ومنح دور يحمل صلاحيات لا يملكها المانح مرفوض
   (حتى لو جاء الطلب مباشرة إلى API متجاوزاً الواجهة).
3. **OWNER/ADMIN لا يُمنحان إلا من المالك**.
4. **حماية آخر مالك**: لا تعطيل ولا سحب دور المالك عن آخر حساب مالك في النظام.
5. **لا حساب بدون دور**: سحب آخر دور عن مستخدم مرفوض.
6. **أدوار النظام محمية**: لا تُحذف، ودور OWNER لا يُعدَّل، وتعديل ADMIN يتطلب تأكيداً صريحاً.
7. **تعطيل موظف** يلغي كل جلساته فوراً (Refresh revoke) ويمنع الدخول والاستخدام.
8. العمليات المركبة (إنشاء موظف + إسناد دور، استبدال صلاحيات دور) داخل **Prisma transactions** ذرّية.
9. كل عملية حساسة تُسجّل في `audit_logs` بلا أي كلمات مرور أو توكنات.

## البنية

```
prisma/            schema.prisma · migrations/ · seed.ts
src/auth/          login/refresh/rotation/sessions/password/verification
src/users/         ملف المستخدم + إدارة المستخدمين
src/employees/     إدارة الموظفين (إنشاء/تعديل/حالة/أدوار)
src/roles/         CRUD للأدوار + استبدال الصلاحيات
src/permissions/   قائمة الصلاحيات مجمّعة حسب الوحدة
src/audit/         AuditService + GET /audit
src/common/        guards · decorators · filters · interceptors · utils · constants
test/              health/ auth/ employees e2e
```

## ملاحظات تشغيلية

- الأسرار في `.env` فقط؛ `.env.example` يحوي أسماء المتغيرات بلا قيم.
- `SEED_OWNER_PHONE` / `SEED_OWNER_PASSWORD` تُنشئ/تحدّث حساب المالك عند الـseed.
- معدلات الطلبات (Rate limits) قابلة للضبط من البيئة (`RATE_*`).
