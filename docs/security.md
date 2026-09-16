# Alwled — Security Documentation (Stage 12)

> هذه الوثيقة تصف الضوابط الأمنية الفعلية في الكود (لا وعودًا)، ومكان كل ضابط، وحدوده.
> لا تحتوي أي سرّ — الأسرار كلها في `.env` (غير المرفوع) والسيرفر.

## 1. المصادقة (Authentication)

| الضابط | التنفيذ | الملف |
| --- | --- | --- |
| تخزين كلمة المرور | Argon2id (`argon2`) | `src/auth/auth.service.ts` |
| Access token | JWT موقَّع (HS256)، مدة قصيرة (`JWT_EXPIRES_IN`) | `src/auth/token.service.ts` |
| Refresh token | Opaque عشوائي 48 bytes، يُخزَّن **مجزَّأً** (`sha256`) فقط | `src/common/utils/crypto.util.ts` |
| Rotation | كل refresh يستهلك التوكن وينشئ خلفًا له | `src/auth/auth.service.ts` |
| Reuse detection | إعادة استخدام توكن مستهلك ⇒ إبطال كل عائلة الجلسة | `src/sessions/sessions.service.ts` |
| Logout / logout-all | إبطال جلسة واحدة / كل الجلسات | `src/auth/auth.controller.ts` |
| الحالة الحيّة للمستخدم | كل طلب محمي يُحمِّل المستخدم من DB ويتحقق من `status` ⇒ تعطيل فوري حتى بالتوكن الصالح | `src/auth/jwt.strategy.ts` |
| أخطاء عامة | رسالة واحدة لبيانات الاعتماد الخاطئة وحساب غير موجود (لا user enumeration) | `src/auth/auth.service.ts` |
| رموز إعادة التعيين | single-use + TTL + تُخزَّن مجزَّأة | `passwordResetToken` |
| `devToken` | يُرجَع **فقط** حين `NODE_ENV !== 'production'` | `src/auth/auth.service.ts` |

## 2. التصريح (Authorization)

- المصدر الوحيد للحقيقة: **الصلاحيات** (`permissions`) الممنوحة للأدوار، لا اسم الدور.
- `JwtAuthGuard` (افتراضي على كل المسارات) + `PermissionsGuard` + `RolesGuard`.
- صلاحيات حساسة: `users.*`, `roles.*`, `permissions.*`, `inventory.*`, `payments.*`, `verification.*`, `dashboard.read`, `analytics.read`, `notifications.admin.read`, `audit.read`.
- حماية المالك: لا يمكن تعطيل/تعديل/حذف حساب OWNER ولا إزالة دور OWNER الأخير (`src/employees`).
- الأدوار النظامية (`isSystem=true`) غير قابلة للحذف.
- **ملكية البيانات**: كل مورد للزبون يُقرأ بشرط `userId = req.user.id`؛ مورد غيره ⇒ **404** (لا 403، حتى لا يُكشف وجوده).

## 3. JWT

- الحمولة: `sub`, `sid`, `iat`, `exp` — لا دور ولا صلاحية ولا حالة (تُقرأ من DB لكل طلب).
- `JWT_SECRET` و`JWT_REFRESH_SECRET` من البيئة فقط؛ لا قيمة افتراضية في الكود.
- توكن مُشوَّه/توقيع خاطئ/خوارزمية مغايرة ⇒ 401.

## 4. التحقق من المدخلات (Validation)

- `ValidationPipe` عام: `whitelist: true` + `forbidNonWhitelisted: true` + `transform`.
- أي حقل غير معرَّف في DTO ⇒ **400** (يمنع mass assignment على `status/amount/provider/reviewedBy/roles/...`).
- حدود أطوال وأرقام على DTOs (`@MaxLength`, `@IsInt`, `@Min`...).
- `HttpExceptionFilter` يحوّل أخطاء Prisma/Postgres الناتجة عن مدخل غير صالح (فائض عددي، طول، نوع) إلى **400** بدل 500، ويحوّل `PayloadTooLargeError` إلى **413**.
- لا يُعاد أي كيان Prisma خام: كل استجابة عبر DTO/serializer، و`passwordHash`/`tokenHash` لا تُنتقى أبدًا.

## 5. الحقن (Injection)

- **SQL**: Prisma ORM في كل الاستعلامات؛ `$queryRaw` فقط بنمط tagged template بارامتري (Dashboard/Analytics)، و**صفر** `$executeRawUnsafe` في `src/`.
- **Command**: صفر استخدام `child_process`/`exec`/`spawn` في `src/`.
- **Path traversal**: لا تحميل ملفات ولا بناء مسارات من مدخلات المستخدم (رفع الصور مؤجَّل؛ الصور روابط `StorageProvider`).
- **SSRF**: لا HTTP client في المشروع (لا `axios`/`HttpService`/`fetch`)؛ مزوّدو الدفع/التحقق/الإشعارات كلهم داخليون.
- **Prototype pollution**: التحقق الصارم يمنع تمرير `__proto__`/`constructor` إلى منطق العمل؛ لا تسلسل غير آمن.

## 6. المعدلات والحدود (Rate limiting)

| السطح | الحد | المصدر |
| --- | --- | --- |
| `/api/v1/auth/*` | 40 طلب/دقيقة لكل IP | `express-rate-limit` في `src/main.ts` |
| عمليات حساسة (login/reset/verification/payments…) | `ThrottlerGuard` + `RATE_LIMITS` | `src/common/constants.ts` |
| إرسال إثبات دفع | 10 / 15 دقيقة | `payments.constants.ts` |
| الطلبات | 30 / 5 دقائق | `RATE_LIMITS.orders` |
| الإشعارات | حدود مستقلة | `RATE_NOTIFICATIONS_*` |

- لا `trust proxy` مُفعَّل ⇒ ترويسات `X-Forwarded-For`/`X-Real-IP` **لا تُصدَّق** (لا يمكن تجاوز الحد برشّها). عند النشر خلف reverse proxy: فعِّل `trust proxy` بحدود صريحة (`app.set('trust proxy', 1)`) واعتمد على IP البروكسي.
- حدود حجم الطلب: حد express الافتراضي (100KB) للـJSON + رفض 413 صريح.

## 7. الترويسات و CORS

- `helmet()` مُفعَّل (`crossOriginResourcePolicy: same-site`) ⇒ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, `X-Download-Options`, `X-Permitted-Cross-Domain-Policies`, `Origin-Agent-Cluster`, `Cross-Origin-Opener-Policy`, و CSP الافتراضية من helmet (النمط `Content-Security-Policy` مضبوط عبر helmet لا يدويًا).
- CORS: قائمة الأ origins من `CORS_ORIGINS` فقط. عند غياب الإعداد ⇒ **لا انعكاس لأي origin (deny by default)**؛ وعند `*` صراحةً ⇒ انعكاس بدون `credentials`.
- `Strict-Transport-Security` يصدر من helmet افتراضيًا (سنة واحدة + includeSubDomains)، وهو المطلوب في الإنتاج؛ في بيئة HTTP محلية لا يضرّه المتصفح لأن الاتصال غير آمن أصلًا. إن أردت تعطيله في التطوير: `helmet({ hsts: false })` عبر إعداد بيئي.
- CSRF: التوكنات تُرسَل في ترويسة `Authorization` لا في Cookies ⇒ سطح CSRF محدود جدًا؛ لا middleware CSRF (لا حاجة مع غياب الكوكيز). عند إضافة Cookie-based auth مستقبلًا ⇒ يجب CSRF token + `SameSite`.
- Swagger: مُفعَّل افتراضيًا في dev فقط؛ في الإنتاج يحتاج `SWAGGER_ENABLED=true`.

## 8. التدقيق (Audit) والسجلات

- `AuditService` يسجّل الفاعل من سياق المصادقة حصرًا (`actorId` من التوكن، لا من الجسم)، والميتاداتا تُنقّى من أي بيانات سرية.
- السجل دائم: حذف المستخدم يجعل `actor_id = NULL` (لا يُحذف السجل).
- لا تسجيل لكلمات المرور/التوكنات/الترويسات/محتويات الإثبات: `LoggingInterceptor` يسجّل الميثود/المسار/الحالة/المدة فقط.

## 9. الأسرار (Secrets)

- المصدر الوحيد: متغيرات البيئة (`.env` محليًا / بيئة التشغيل في الإنتاج). `.env.example` يحوي **أسماء المتغيرات فقط**.
- `.gitignore` يمنع `.env`، و`.dockerignore` يمنع نسخه داخل الصور.
- لا مفاتيح GitHub/مدفوعات/مزوّدين في الكود أو المستودع.

## 10. مزوّدو الخدمات (Provider boundaries)

| المزوّد | الحالة | ملاحظة |
| --- | --- | --- |
| StorageProvider | داخلي (URL-based) | لا رفع ملفات ⇒ لا سطح path traversal |
| PaymentProvider | غير مُنفَّذ (مسار شام كاش يدوي) | `provider`/`providerPaymentId` = `null` دائمًا، والنجاح يحتاج دليلًا + قرار موظف (قيد DB) |
| VerificationProvider | `LOG` فقط | يعيد `PENDING` دائمًا؛ لا اتصال خارجي |
| NotificationProvider | `IN_APP` فقط | "التسليم" = صف في قاعدة البيانات؛ لا `providerReference` مُصطنع |

## 11. إعدادات الإنتاج (Production checklist)

- [ ] `NODE_ENV=production` (يعطّل `devToken`، ويقيّد Swagger).
- [ ] `JWT_SECRET` / `JWT_REFRESH_SECRET` عشوائية قوية (≥32 bytes) ومختلفة عن dev.
- [ ] `DATABASE_URL` بمستخدم محدود الصلاحيات + كلمة مرور قوية + TLS إن كانت القاعدة بعيدة.
- [ ] `CORS_ORIGINS` بقائمة نطاقات الإنتاج فقط (لا `*`).
- [ ] HTTPS على الـreverse proxy + HSTS هناك.
- [ ] `trust proxy` مضبوط بحدود صريحة إذا كان خلف proxy.
- [ ] سياسة Swagger: مغلق (افتراضي) أو محمي.
- [ ] نسخ احتياطي آلي + اختبار استرجاع دوري + تشفير النسخ + سياسة احتفاظ.
- [ ] مراقبة السجلات (Logging عام بلا بيانات حساسة) + تنبيه على 5xx.
- [ ] `npm audit` بعد كل تحديث (المتبقّي موثَّق في `docs/security-findings.md`).
- [ ] Docker: مرحلة بناء متعددة، `npm ci --omit=dev`، مستخدم غير root، HEALTHCHECK (الملف الحالي للتطوير فقط).

## 12. القيود المعروفة المؤجَّلة

- **رفع الملفات**: غير مُنفَّذ ⇒ لا تحقق MIME/حجم بعد. عند التنفيذ: فحص النوع الحقيقي، حدّ حجم، مفاتيح تخزين مولَّدة، ومنع أسماء الملفات من المستخدم.
- **قائمة خصم كلمات المرور** (breached/common passwords): سياسة الطول/التعقيد فقط حاليًا.
- **2FA / MFA**: غير مُنفَّذ.
- **مفاتيح idempotency للأحداث الخارجية**: لا يوجد مزوّد خارجي بعد.
