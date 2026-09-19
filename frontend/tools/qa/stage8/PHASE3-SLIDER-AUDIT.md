# PHASE 3 — ADMIN-MANAGED HERO SLIDER · تقرير الجرد (AUDIT) والخطة

**الوضع:** جرد فقط — لم يُعدَّل أي ملف مصدر، ولم تُنشأ أي migration.
**التاريخ:** 2026-09-19 · **الخدمة الحيّة:** https://panel.fahd-car.cloud/alwled/shop/

---

## 1) ما وجدته في البنية الحالية (أدلة)

| البنية | الحالة الفعلية | الدليل |
|---|---|---|
| Backend | NestJS — **21 وحدة** | `src/{auth,products,categories,brands,cart,orders,payments,checkout,notifications,dashboard,audit,permissions,roles,users,inventory,specifications,employees,customer-verification,health,config,database}` |
| Prisma | **28 model · 15 migration** | `prisma/schema.prisma` · أحدثها `20260916081433_stage11_notification_delivery_status_snake_case` |
| **بنية رفع الملفات** | **موجودة كتجريد**: `STORAGE_PROVIDER` ⇒ `UrlStorageProvider` | `src/common/storage/{storage.interface.ts,storage.module.ts,url-storage.provider.ts}` |
| صور المنتجات | model `ProductImage` (مرجع URL) | `prisma/schema.prisma:341` |
| لوحة الإدارة | **Python** (خدمة `alwled-panel`) تخدم مجلد `frontend` | `ExecStart=/usr/bin/python3 tools/serve.py --port 5173` · `WorkingDirectory=/root/alwled/frontend` |
| نمط الـAPI | `/alwled-api/api/v1/...` عبر nginx ⇒ NestJS :3100 | — |
| القرص | **3.0G متاح (94% ممتلئ)** | `df -h /` |

**الخلاصة المهمة:** «بنية الرفع» القائمة = **مرجع URL** لا ملفات مرفوعة. لا يوجد multipart/diskStorage في الـbackend إطلاقًا (بحث `multer|FileInterceptor|diskStorage` ⇒ **0 نتيجة**).

---

## 2) خطة التنفيذ المقترحة (بالترتيب، مع بوابات موافقة)

**الخطوة 1 — قاعدة البيانات (تحتاج موافقتك الصريحة)**
- model جديد `SliderSlide`: `id` · `desktopImageUrl` (إلزامي) · `mobileImageUrl` (اختياري) · `altText` · `linkUrl` (اختياري) · `title/subtitle/ctaLabel` (اختيارية) · `isEnabled` · `sortOrder` · `createdAt/updatedAt`.
- **migration واحدة** فقط. لا تعديل على أي جدول قائم.
- النمط مطابق لـ`ProductImage` (مرجع URL) — لا بنية ثانية موازية.

**الخطوة 2 — الـAPI (وحدة `slider` بنمط المشروع)**
- عام: `GET /api/v1/slider` ⇒ الشرائح **المفعّلة فقط** بترتيبها (بلا أي بيانات إدارية).
- إداري: `POST/PATCH/DELETE/reorder` تحت نفس `auth` + `permissions` + تسجيل في `audit` (لا عملية إدارية عامة).
- تحقق: نوع الملف/الحجم/امتداد المسار/حالة التفعيل/الترتيب.

**الخطوة 3 — الصور (تحتاج قرارك)**
- **الخيار A (توصيتي):** إضافة `LocalStorageProvider` **داخل نفس التجريد القائم** + مجلد `uploads/slider/` يخدمه nginx + تحقق صارم (نوع PNG/JPG/WebP · ≤ 400KB · فحص الأبعاد) + تحويل WebP تلقائي. يمنحك «رفع صورة» حقيقيًا في اللوحة كما طلبت §6.
- **الخيار B:** إبقاء النمط الحالي (لصق **رابط** صورة) — أسرع، بلا رفع، لكنه لا يلبّي «Upload Desktop/Mobile image» في §6.

**الخطوة 4 — واجهة الإدارة:** صفحة جديدة في `frontend/admin/` (بنفس نمط اللوحة اليدوية): «واجهة المتجر → السلايدر» — إضافة/تعديل/حذف/تفعيل/ترتيب + معاينة الصورتين + إرشاد الأبعاد (‎1920×640‎ 3:1 · ‎1080×900‎ 6:5) بلا قصّ صامت للملفات.

**الخطوة 5 — السلايدر في المتجر:** استبدال الـHero الحالي (بعد أن يعمل الجديد ✓ لا الاثنان معًا ✓) — 3:1 ديسكتوب / 6:5 جوال · نقاط صغيرة · swipe · autoplay 5–6s يتوقف عند التفاعل · `prefers-reduced-motion` يمنع الحركة التلقائية · حالة **صفر شرائح** ⇒ إغلاق القسم بالكامل ✓ · شريحة واحدة ⇒ بلا أسهم/نقاط/autoplay ✓ · رابط حقيقي فقط (لا مسارات مُختلقة ✓).

**الخطوة 6 — QA:** 10 عروض (360→1920) · لا تشويه/قصّ/فائض/إزاحة · فاتح/داكن · لوحة مفاتيح · swipe/dots/autoplay · حالات (0/1/متعدد) + لقطات متجر + لقطات لوحة إدارة + الأبعاد المرصودة.

---

## 3) ما أحتاج قرارك فيه قبل أي كتابة كود

1. **موافقة على migration واحدة** (جدول `slider_slides` الجديد).
2. **استراتيجية الصور: الخيار A (رفع محلي) أم الخيار B (روابط)؟** — ملاحظة: القرص 3.0G متاح فقط (94% ممتلئ) ⇒ مع A سأضبط حدًّا صارمًا (≤400KB/شريحة + WebP).
3. **الصورة التي أرسلتها** (بانر 3:1 تقريبًا): أستخدمها كشريحة حقيقية أولى — أنسخها إلى مسار المتجر الرسمي ✓ (بلا بيانات مُختلقة ✓).

**بلا هذه القرارات لن أكتب أي كود** — التزامًا بقاعدتك: لا migration ولا بنية تخزين جديدة بلا إذن صريح.
