# Alwled — Backend (متجر الأجهزة الكهربائية)

Node.js + TypeScript (strict) + NestJS + PostgreSQL + Prisma + JWT + Argon2 + Docker + Swagger.

> **المرحلة 1:** أساس البنية (Users/Roles/Permissions + Auth foundation).
> **المرحلة 2:** دورة حياة الحساب الكاملة + إدارة المستخدمين + التحقق + سجل التدقيق.

## التشغيل
```bash
cp .env.example .env
npm install
npx prisma migrate deploy     # أو: npx prisma migrate dev
npx prisma db seed            # الأدوار والصلاحيات + OWNER من متغيرات البيئة
npm run start:dev
```
- Health: `GET /api/v1/health`
- Swagger: `/api/docs`

## متغيرات البيئة الأساسية
`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
`PORT`, `NODE_ENV`, `CORS_ORIGINS`, `SEED_OWNER_PHONE`, `SEED_OWNER_PASSWORD`,
`PASSWORD_RESET_TTL_MINUTES`, `VERIFICATION_TTL_MINUTES`, وحدود `RATE_*`.

## الواجهات (v1)
| Method | Endpoint | الحماية |
|---|---|---|
| POST | `/api/v1/auth/register` | عام + rate limit |
| POST | `/api/v1/auth/login` | عام + rate limit |
| POST | `/api/v1/auth/refresh` | عام + rotation |
| POST | `/api/v1/auth/logout` | عام (يعتمد على توكن الجلسة) |
| POST | `/api/v1/auth/logout-all` | Access Token |
| GET | `/api/v1/auth/me` | Access Token |
| GET | `/api/v1/auth/sessions` | Access Token |
| POST | `/api/v1/auth/change-password` | Access Token |
| POST | `/api/v1/auth/forgot-password` | عام + rate limit (رد عام) |
| POST | `/api/v1/auth/reset-password` | عام + توكن لمرة واحدة |
| POST | `/api/v1/auth/resend-verification` | Access Token + rate limit |
| POST | `/api/v1/auth/verify-account` | Access Token |
| GET/PATCH | `/api/v1/users/me` | Access Token |
| GET | `/api/v1/users` | `users.read` أو `employees.read` |
| GET | `/api/v1/users/:id` | `users.read` أو `employees.read` |
| PATCH | `/api/v1/users/:id/status` | `users.update` أو `employees.update` |
| GET | `/api/v1/roles` · `/api/v1/permissions` | `dashboard.read` |

## قرارات معمارية
- **الجلسات:** كل Refresh Token يمثل جهازاً/جلسة. يُخزَّن **SHA-256** فقط، والبحث مباشر بـ`sessionId`
  (بدل مسح كل التوكنات). إعادة استخدام توكن مُستهلك ⇒ إلغاء **كل** جلسات المستخدم + تسجيل `TOKEN_REUSE_DETECTED`.
- **Access Token خفيف:** `sub` + `roles` + `permissions` فقط (بلا بريد/هاتف/أسرار).
- **JwtStrategy يتحقق من DB كل طلب:** تعطيل حساب يسري فوراً، وتغيير الصلاحيات يأخذ مفعوله بدون انتظار انتهاء التوكن.
- **التحقق من الحساب:** `VerificationService` + `VerificationProvider` (provider مؤقت يسجّل فقط) — جاهز لـSMS/WhatsApp/Email/OTP لاحقاً.
- **Audit Log:** يسجّل الرموز (actions) فقط، وممنوع تسجيل كلمات المرور أو التوكنات.
- **سياسة كلمة المرور:** 8 أحرف + كبير + صغير + رقم + رمز — مطبقة على التسجيل/التغيير/الإعادة.

## الاختبارات
```bash
npm test          # وحدة
npm run test:e2e  # تكامل على قاعدة بيانات حقيقية
```

## Docker (تطوير)
```bash
docker compose up -d
```
