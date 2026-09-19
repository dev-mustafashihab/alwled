# Alwled — Production Deployment Guide (Stage 15)

> هذا المستند يشرح كيف يُشغَّل المشروع في الإنتاج بشكل آمن وقابل للصيانة والاسترجاع.
> لا يحتوي أي سرّ حقيقي، ولا يفترض وجود دومين أو شهادة TLS — يُستبدلان بقيم النشر الفعلية.

---

## 1) Architecture

```
Internet
   │
   ▼
HTTPS / Reverse Proxy (nginx)          ← TLS termination + HSTS + static caching
   │                 │
   │                 └─► Frontend (static: HTML/CSS/Vanilla JS)   /alwled/  ·  /alwled/shop/
   ▼
NestJS API (Node 22)                   ← /alwled-api/api/v1
   │
   ▼
PostgreSQL 16
```

- الواجهة **لا تحتاج build ولا npm ولا CDN** — ملفات ثابتة تُقدَّم من الـproxy (Stage 13/14).
- الـAPI يتحدث مع PostgreSQL فقط. لا Redis، لا queue خارجي، لا مزوّد دفع/رسائل/تحقق خارجي.
- تشغيل مدعوم بطريقتين: **systemd + node** (الحالي) أو **Docker** (Stage 15).

---

## 2) Requirements

| المتطلب | النسخة | ملاحظة |
| --- | --- | --- |
| Node.js | 22 LTS | أو Docker 24+ |
| PostgreSQL | 16 | يفضّل اتصال محلي/شبكة خاصة |
| nginx | 1.24+ | TLS + static + proxy |
| ذاكرة | 512MB+ | العملية الواحدة |

الحزم: `npm ci --omit=dev` للإنتاج + `prisma` CLI (devDependency — يُستخدم في البناء/الترحيل فقط).

---

## 3) Environment setup

1. انسخ القالب: `cp .env.example .env` (ولن يُتتبَّع في Git أبداً).
2. املأ القيم الحقيقية **محلياً** أو من secret manager — لا تُكتب في المستودع ولا في الصور.
3. الإلزامي في production: `DATABASE_URL` · `JWT_SECRET` · `JWT_REFRESH_SECRET`
   (يُرفض الإقلاع إذا كانت ناقصة أو قيمة placeholder أو أقل من 32 حرفاً).
4. الاختياري حسب التصميم: كل `SHAMCASH_*` — غيابها يعني `configured=false` (لا اختراع بيانات محفظة).
5. `CORS_ORIGINS` فارغ = نفس الأصل فقط (الوضع الحالي). `TRUST_PROXY=1` خلف nginx.
6. `SWAGGER_ENABLED=false` في production (القرار الافتراضي).

**لحظة الإقلاع** تُطبع سطور تشخيص آمنة بلا قيم: بيئة التشغيل، المنفذ، حالة Swagger، مزوّدا التحقق/الإشعارات، وحالة شام كاش.

---

## 4) Database migration (production)

```bash
# 1) نسخة احتياطية قبل أي ترحيل (انظر database-operations.md)
# 2) تثبيت نسخة الكود المطلوبة
npm ci --omit=dev
# 3) توليد عميل Prisma (يتم عادةً في البناء)
npx prisma generate
# 4) تطبيق الترحيلات — الأمر الوحيد المسموح في production
npx prisma migrate deploy
# 5) فحص الحالة
npx prisma migrate status
```

**ممنوع في production:** `prisma migrate dev` · `prisma db push` · `prisma migrate reset` · أي `DROP`.
(سكربت `npm run prisma:deploy` = `prisma migrate deploy` ✓ موجود في package.json.)

---

## 5) Startup

**Docker (موصى به):**
```bash
cp .env.example .env      # ثم املأ القيم
docker compose up -d --build
docker compose ps
```

**بدون Docker (systemd):**
```bash
npm ci --omit=dev && npm run build
NODE_ENV=production node dist/src/main.js     # لاحظ: dist/src/main.js (مخرج nest build)
# أو: npm run start:prod
```
وحدة systemd نموذجية:
```ini
[Service]
EnvironmentFile=/root/alwled/.env
ExecStart=/usr/bin/node /root/alwled/dist/src/main.js
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
User=alwled
```
`SIGTERM`/`SIGINT` تُعالَج عبر `app.enableShutdownHooks()`: تُغلق اتصالات Prisma ويُنهى الطلب الجاري بدل قطعه.

---

## 6) Health checks

| المسار | الغرض | الاستجابة |
| --- | --- | --- |
| `/api/v1/health` | الفحص القائم (توافق خلفي) | 200 دائماً + `database: up|down` |
| `/api/v1/health/live` | **Liveness** — العملية حيّة (لا تلمس DB) | 200 |
| `/api/v1/health/ready` | **Readiness** — قاعدة البيانات متاحة | 200 · 503 |

- HEALTHCHECK في Docker يستخدم `ready` (وإلا أُعيد تشغيل الحاوية بلا سبب عند تعطّل DB لفترة قصيرة).
- الاستجابات لا تكشف: عنوان قاعدة البيانات، بيانات اعتماد، أسرار، تتبّع أخطاء، أو أي قيمة بيئة.

---

## 7) Logs

- سطر واحد لكل طلب: `METHOD path status duration rid=<requestId>` بلا جسم طلب وبلا `Authorization`.
- معاملات الاستعلام الحساسة (`token`, `password`, `code`, `secret`, `key`) تُستبدل بـ`[redacted]` قبل الكتابة.
- لا تُسجَّل: كلمة مرور، `passwordHash`، `refreshToken`، `tokenHash`، ترويسة Authorization، مفاتيح API، أسرار مزوّد، محتوى إثبات الدفع.
- ربط الطلب بالخطأ: ترويسة `X-Request-Id` تُعاد للعميل وتظهر في السجل (`rid=`)، وتُقبل من العميل فقط إذا كانت بصيغة آمنة (`[A-Za-z0-9._-]{8,64}`) وإلا يولّد الخادم واحدة.
- الأخطاء 5xx تُسجَّل مع أثر كامل في السجل، بينما الرد يحمل رسالة عامة فقط.
- مخارج systemd: `journalctl -u alwled-api -f` · أو ملف الحاوية: `docker compose logs -f api`.

---

## 8) Backups

انظر `docs/database-operations.md` (نسخ منطقي، تشفير، احتفاظ، تحقق، تخزين خارج السيرفر).

---

## 9) Restore

انظر `docs/database-operations.md` §Restore — بخطوات `pg_restore` لبيئة **منفصلة** أولاً، ثم الإنتاج عند الحاجة.

---

## 10) Rollback

انظر `docs/database-operations.md` §Rollback. القاعدة: **الترحيلات لا تُلغى عشوائياً**؛ الرجوع يكون بإصدار تطبيق متوافق مع المخطط الحالي، أو بترحيل جديد مضاد، أو باسترجاع نسخة احتياطية موثّقة (خطة قصوى).

---

## 11) Security checklist

- [ ] `JWT_SECRET` و`JWT_REFRESH_SECRET` من secret manager، 32+ حرفاً، غير مكرّرة بين البيئات.
- [ ] `DATABASE_URL` بحساب محدود الصلاحيات على قاعدة المشروع فقط.
- [ ] `SWAGGER_ENABLED=false` في production.
- [ ] CORS محدود بأصل واحد (`CORS_ORIGINS`) أو فارغ (نفس الأصل).
- [ ] `TRUST_PROXY` مطابق لعدد قفزات الـproxy.
- [ ] HTTPS فعّال + إعادة توجيه من HTTP + HSTS بعد التأكد من الاستقرار.
- [ ] ترويسات الحماية (Helmet): CSP، `Referrer-Policy`، `X-Content-Type-Options`، `X-Frame-Options`/`frame-ancestors`.
- [ ] حدود المعدّل فعّالة (login/refresh/reset/verification/order/payment/notifications).
- [ ] لا أسرار في السجلات ولا في الواجهة (`frontend:check` + فحص الأسرار).
- [ ] `/api/v1/health*` مكشوف للـproxy فقط (أو داخلياً).
- [ ] نسخة احتياطية حديثة ومُتحقَّق منها قبل كل نشر.

---

## 12) Deployment checklist

- [ ] Environment مُهيّأ (الأسرار خارج المستودع)
- [ ] نسخة احتياطية حديثة + تحقق من الاسترجاع
- [ ] `npm ci --omit=dev` + `npm run build` (أو `docker compose build`)
- [ ] `npx prisma migrate deploy` ثم `migrate status` = up to date
- [ ] تشغيل الخدمة + انتظار `health/ready` = 200
- [ ] فحص الواجهة: `/alwled/` (لوحة) و`/alwled/shop/` (متجر) تُفتح مباشرة من المسار
- [ ] فحص وظيفي سريع: تسجيل دخول، كتالوج عام، سلة، طلب، دفعة، إشعارات
- [ ] مراجعة السجلات: بلا أسرار، بلا 5xx متكررة
- [ ] التخطيط للرجوع (Rollback) جاهز

---

## 13) Incident checklist

1. **5xx متزايد**: افحص `/health/ready` أولاً (قاعدة البيانات؟)، ثم السجل بالـ`rid` المُبلَّغ من العميل.
2. **429 متزايد**: تحقق من شرعية المصدر قبل تعديل الحدود؛ الحدود لكل IP وتُصفَّر بإعادة التشغيل.
3. **DB غير متاحة**: الحاوية تبقى حيّة (liveness لا يلمس DB) وreadiness يُعلم الـ503 ⇒ لا تعِد التشغيل تلقائياً في حلقة.
4. **فشل الدفع/المراجعة**: الحالة في الطابور (`PENDING_REVIEW`) لا تفقد — أعد المراجعة يدوياً؛ لا "نجاح" آلي.
5. **تسريب سرّ محتمل**: أبطِل/دوّر السر فوراً، أعد النشر، ثم افحص سجلات الوصول.
6. **شك بتلاعب بيانات**: اعتمد `audit_logs` (كل قرارات الدفع والتوثيق مسجّلة بهوية الموظف).

---

## 14) Known limitations (ليست أعطالاً)

- **Throttling محلي لكل نسخة**: الحدود داخل ذاكرة العملية ⇒ عند تشغيل أكثر من نسخة خلف موازن، يصبح الحد مضروباً بعدد النسخ. الحل المستقبلي (Redis) **غير مطلوب** في هذه المرحلة وهو موثّق فقط.
- **لا مزوّد إشعارات خارجي**: `IN_APP` فقط.
- **لا مزوّد تحقق خارجي**: `LOG` فقط، والقرار يدوي.
- **لا API شام كاش**: التسجيل يدوي بمراجعة موظف؛ `configured=false` حتى تُضبط بيانات الحساب.
- **لا نسخ احتياطي سحابي آلي**: النسخ يدوية/مجدولة على مستوى السيرفر وفق `database-operations.md`.
- **لا رفع ملفات**: إثبات الدفع رابط (`proofUrl`) لا ملف؛ لا storage provider.
- **Swagger معطّل في production افتراضياً**؛ تشغيله يتطلب `SWAGGER_ENABLED=true` وقراراً أمنياً صريحاً.
