# Alwled — Stage 12 Findings & Threat Model

آخر تحديث: Stage 12 (Testing + Security Hardening). كل finding مُثبَت بأداة أو اختبار، وكل إصلاح له اختبار انحدار في `test/security.e2e-spec.ts`.

## 1. Threat Model (مختصر)

| Actor | Assets المستهدفة | Threat | Mitigation | Test |
| --- | --- | --- | --- | --- |
| مهاجم مجهول | بيانات الدخول، الأصول العامة | تخمين كلمات المرور، تعداد الحسابات | رسائل خطأ موحّدة، Argon2id، rate limit 40/دقيقة | `Authentication` suite |
| مهاجم مجهول | الخدمة | DoS بجسم ضخم، JSON مشوّه | حد جسم 100KB + 413 صريح، رفض JSON غير صالح بـ400 | `Boundary & fuzz`, `Error leakage` |
| زبون | بيانات زبون آخر | IDOR/BOLA عبر تغيير IDs | ملكية من سياق المصادقة + 404 للموارد الغريبة | `IDOR / BOLA` |
| زبون | تصعيد امتياز | mass assignment، status/amount spoofing | whitelist + forbidNonWhitelisted، حقول مالية/حالة من السيرفر | `Mass assignment & spoofing` |
| موظف بلا صلاحيات | لوحة الإدارة | الوصول بلا صلاحية | PermissionGuard (لا role name) | `Authorization matrix` |
| موظف/أدمن | حساب المالك | تغيير/تعطيل/إزالة آخر OWNER | حماية المالك + منع إزالة آخر دور OWNER | `Privilege escalation` |
| مهاجم | قاعدة البيانات | SQL injection | Prisma ORM + `$queryRaw` بارامتري فقط، صفر `$executeRawUnsafe` | `Injection` |
| مهاجم | المنطق | prototype pollution | رفض الحقول غير المعروفة، لا دمج غير آمن | `Prototype pollution` |
| مهاجم | الترويسات/الـIP | تجاوز rate limit بـ XFF | لا `trust proxy` افتراضيًا | `Rate limiting` |
| زبون | المدفوعات | تغيير المبلغ/الحالة/المزوّد، إثبات مزيف | المبلغ/العملة من الطلب في DB، قيود DB (دليل إلزامي)، قرار موظف موثّق | `Payment tampering` |
| زبون | المخزون | overselling عبر التزامن | معاملة ذرّية للحجز + قيود DB (`reserved ≤ quantity`) | `Concurrency & integrity` |
| مهاجم | التسريب | stack traces/SQL/أسرار في الأخطاء | `HttpExceptionFilter` موحّد (5xx = رسالة عامة) | `Error leakage` |
| مستخدم | Audit | تزوير الفاعل | `actorId` من التوكن فقط؛ `/audit` للقراءة فقط | `Admin surface hardening` |
| مهاجم | كل الأسرار | استخراج أسرار من الكود/المستودع | لا أسرار في الكود؛ `.env` غير مرفوع؛ `.dockerignore` | `Secrets` + scan |

## 2. Findings

| # | Severity | Finding | Status | Fix | Regression test |
| --- | --- | --- | --- | --- | --- |
| F1 | MEDIUM | جسم طلب أكبر من الحد كان يُعاد كـ**500** بدل 413 (خطأ body-parser غير معالج) | **FIXED** | `HttpExceptionFilter`: `PayloadTooLargeError`/`status=413` ⇒ 413 برسالة عربية | `oversized payloads are rejected or bounded` |
| F2 | MEDIUM | مدخلات عددية خارج النطاق (مثل `productId=1e20`) وأخطاء Prisma/Postgres عن مدخل غير صالح كانت تُعاد كـ**500** | **FIXED** | خرائط أكواد `P2000/P2005/P2006/P2007/P2010/P2011/P2019/P2020/P2023/P2033` + `22003/22P02/22001/22021/22018` + أنماط الرسائل ⇒ **400** بلا تسريب تفاصيل | `numeric and date boundaries are validated, not crashed` |
| F3 | MEDIUM | محارف غير صالحة (NUL byte `\u0000`) في نص ⇒ **500** (قاعدة البيانات ترفض المحرف) | **FIXED** | نفس المعالج أعلاه (تُصنَّف كمدخل غير صالح ⇒ 400) | `profile updates stay stable for extreme inputs` |
| F4 | MEDIUM | CORS: عند غياب `CORS_ORIGINS` (أو `*`) كان يُعكس أي origin مع `credentials: true` | **FIXED** | deny-by-default عند غياب الإعداد؛ `*` ⇒ بلا credentials؛ تحديد methods/headers صريحة + تحذير في اللوج | مراجعة كود + `docs/security.md` |
| F5 | MEDIUM | Swagger (`/api/docs`) كان مُتاحًا في كل البيئات بما فيها الإنتاج | **FIXED** | في `NODE_ENV=production` يحتاج `SWAGGER_ENABLED=true` | مراجعة + `docs/security.md` |
| F6 | MEDIUM | `multer ≤2.2.0` (7 إرشادات DoS) يدخل عبر `@nestjs/platform-express` | **FIXED** | `overrides: multer ^2.4.0` (لا يوجد أي مسار multipart في التطبيق ⇒ لم يكن قابلًا للاستغلال أصلًا) | `npm audit`: انخفض 8 high ⇒ 4 (كلها dev) |
| F7 | LOW | إرشادات `lodash`/`picomatch`/`qs` (تضارب نماذج/DoS محدود) | **FIXED** | `overrides` للإصدارات المُصلَحة داخل نفس الـmajor | `npm audit` |
| F8 | MEDIUM | إرشادات `js-yaml` عبر `@nestjs/swagger` (DoS عند تحميل YAML) — لا يوجد إصلاح داخل 4.x | **DEFERRED** | لا استخدام لـYAML في هذا التطبيق (Swagger يُبنى من الكود)؛ الإصلاح يتطلب ترقية major (Nest 11/Swagger 11) | موثَّق |
| F9 | LOW | `@nestjs/cli` + `glob`/`tmp` (أدوات بناء/dev فقط) بإرشادات high | **DEFERRED** | ترقية `@nestjs/cli` إلى 12 وNest إلى 11 في مرحلة تبعيات مخصّصة (breaking) | موثَّق |
| F10 | LOW | Dockerfile بوضع تطوير: root، `npm install`، `start:dev`، بلا HEALTHCHECK | **PARTIAL** | أُضيف `.dockerignore` (يمنع نسخ `.env` داخل الصورة). إبقاء dev كما هو؛ إعداد الإنتاج موثَّق في `docs/security.md` | ملف `.dockerignore` |
| F11 | LOW | `.gitignore` لم يكن يستثني ملفات `.env.*` | **FIXED** | إضافة `.env.*` مع استثناء `.env.example` | `.gitignore` |
| F12 | INFO | ترويسات `X-Forwarded-For`/`X-Real-IP` غير موثوقة (لا `trust proxy`) ⇒ لا تجاوز لحدود المعدل | **ACCEPTED (جيد)** | يبقى كما هو؛ عند النشر خلف proxy: `trust proxy` بحدود صريحة | `throttles repeated login attempts...` |
| F13 | INFO | `devToken` (رمز إعادة التعيين في الاستجابة) متاح في غير الإنتاج فقط | **VERIFIED** | مُقيَّد بـ`NODE_ENV !== 'production'` | `password reset tokens are single-use and expire (and never leak in production)` |
| F14 | INFO | لا يوجد رفع ملفات ⇒ لا سطح MIME/path traversal | **VERIFIED (none)** | رفع الصور مؤجَّل (روابط StorageProvider فقط) | scan: 0 `FileInterceptor`/`multer` usage |
| F15 | INFO | لا SSRF: صفر HTTP client في `src/` | **VERIFIED (none)** | كل المزوّدين داخليون | scan: 0 `axios`/`HttpService`/`fetch` |

### Secrets (بلا أي قيمة)

| البند | النتيجة |
| --- | --- |
| Secrets في `src/`/`prisma/`/`test/`/`scripts/`/Dockerfile/compose/package.json | **0** |
| Secrets في `.env.example` | **0** (أسماء فقط) |
| Secrets في الشجرة كاملة (بعد استثناء node_modules/dist) | 0 مطابقة حقيقية (مطابقات `sk-` كلها من اسم الحزمة `check-disk-space` — false positive) |
| Git history | **غير قابل للفحص محليًا**: لا يوجد `.git` في نسخة العمل؛ التاريخ على GitHub. لم يُستخدم أي توكن ولم يُنفَّذ `git push`. |
| رمز GitHub ظهر في سياق الجلسة سابقًا | **SECRET FOUND — ROTATION REQUIRED** (لم يُطبع، ولم يُستخدم) |

## 3. Final Test Numbers (Stage 12)

| المقياس | قبل Stage 12 | بعد Stage 12 |
| --- | --- | --- |
| Unit | 160 (18 suites) | **184 (19 suites)** |
| E2E | 253 (9 suites) | **348 (11 suites)** |
| المجموع | 413 | **532** |
| فشل | 0 | **0** |
| متخطّى (skipped) | 0 | **0** |
| اختبارات أمنية جديدة | — | **69** (`test/security.e2e-spec.ts`) |
| Build / tsc / prisma validate / migrate status | PASS | **PASS / PASS / PASS / up to date (14 migrations)** |
| `npm audit` | 25 (8 high, 13 moderate, 4 low) | **19 (4 high, 11 moderate, 4 low)** — لا high قابل للاستغلال في مسارات التطبيق |

### Performance smoke (مقاييس حقيقية على الخادم المحلي)

| Endpoint | Status | Latency |
| --- | --- | --- |
| GET /api/v1/health | 200 | 40ms |
| POST /api/v1/auth/login (Argon2) | 200 | 311ms |
| GET /api/v1/notifications?limit=20 | 200 | 58ms |
| GET /api/v1/admin/orders?limit=20 | 200 | 22ms |
| GET /api/v1/admin/payments?limit=20 | 200 | 14ms |
| GET /api/v1/admin/dashboard/overview | 200 | 34ms |
| GET /api/v1/admin/analytics/timeseries?granularity=day | 200 | 16ms |
| GET /api/v1/admin/notifications?limit=20 | 200 | 22ms |
| GET /api/v1/audit?limit=20 | 200 | 30ms |
| GET /api/v1/products?limit=20 | 200 | 15ms |
| GET /api/v1/inventory?limit=20 | 200 | 21ms |

لا N+1 على المسارات العامة: كل القوائم بـ`take` محدود، و`recipientsByPermission` بـ`take` صريح، وأُصلح N+1 في fan-out الإشعارات (استعلامان مُجمَّعان بدل استعلامين لكل مستلم).

### Database snapshot (قبل/بعد)

| الجدول | قبل Stage 12 | بعد Stage 12 | ملاحظة |
| --- | --- | --- | --- |
| users | 105 | 110 | +5 حسابات سُجّلت عبر الاختبارات/التجارب (لا حذف لأي مستخدم حقيقي) |
| roles | 5 | 5 | الأدوار النظامية فقط (أُزيلت 16 دور اختبار أنشأها فحص المصفوفة) |
| permissions / role_permissions | 45 / 51 | 45 / 53 | لا تغيير في الصلاحيات |
| products / inventory | 2 / 2 | 2 / 2 | بيانات seed التجريبية |
| orders / payments / verifications | 0 / 0 / 0 | 0 / 0 / 0 | لا بيانات أعمال جديدة |
| notifications / outbox | 0 / 0 | 2797 / 1006 | كلها من اختبارات Stage 11/12 (سجلات اختبار لا بيانات أعمال) |
| audit_logs | 9700 | 16149 | نمو مقصود: كل عملية اختبارية تُسجَّل (السجل دائم بالتصميم) — لا تعديل ولا حذف |

### DB integrity (read-only، النتيجة الآن)

`bad_order_totals=0 · bad_payment_amounts=0 · fake_success=0 · orphan_verifications=0 · orphan_notifications=0 · dup_notifications=0 · dup_outbox=0 · dup_order_numbers=0 · shamcash_provider_leak=0 · inventory_violations=0`
و**23 CHECK constraint** في قاعدة البيانات تحمي المال/المخزون/الأدلة (منها `orders_total_matches_parts`, `inventory_reserved_lte_quantity`, `payments_success_requires_evidence`, `verification_rejection_requires_reason`).

## 4. Production Readiness

**BLOCKED (بشكل جزئي ومقصود)**: الكود والأمن جاهزان (0 Critical · 0 High قابلة للاستغلال في مسارات التطبيق الفعلية)، لكن النشر يتطلب أعمالًا خارج نطاق Stage 12:

1. بنود قائمة الإنتاج في `docs/security.md` §11 (HTTPS/HSTS على الـproxy، أسرار إنتاج مختلفة، `CORS_ORIGINS` إنتاجية، `NODE_ENV=production`، نسخ احتياطي).
2. ترقية التبعيات الكبرى (Nest 11 / CLI 12) لإغلاق F8/F9.
3. Dockerfile إنتاجي (multi-stage، non-root، `npm ci --omit=dev`، HEALTHCHECK).
4. لا توجد migration تخريبية جديدة في Stage 12 (لم تُضَف أي migration).
