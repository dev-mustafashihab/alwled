# PHASE 3 — STEP 3F · CATALOG VISUAL SYSTEM · DARK MODE · STATES

**النوع:** CSS فقط (بلا JS · بلا Backend) · **التاريخ:** 2026-09-18
**أدوات:** `frontend/tools/qa/stage3f/` (`probe3f.py before|after` · `focus_check.py` · `verify3f.py` · `compare3f.py`) · JSON: `probe3f-before.json` · `probe3f-after.json`
**نسخ احتياطية:** `backup-shop.css` · `backup-shop.filters.css` + `backup-md5-before.txt`

---

## 1) FILES MODIFIED

| الملف | md5 قبل → بعد | الحجم |
|---|---|---|
| `frontend/shop/assets/css/shop.filters.css` | `51a53a40…` → `bb772219…` | 25 سطرًا معدّلًا |
| `frontend/shop/assets/css/shop.css` | `8d544511…` → `8e2e202a…` | 108 سطرًا (5 استبدالات لونية + كتلة 3F جديدة) |
| **JS** | `shop.js 897310d7…` · `shop.pages.js 3b38eeee…` — **بلا تغيير** | **0** |
| **Backend / DB / Routes** | — | **0** |
| `tokens.css` · `shop.home.css` · `shop.header.css` · `shop.search.css` | — | **لم تُلمس** ✓ |

`find frontend/shop/assets/js src -newermt "17:40"` ⇒ فراغ ✓ · الأقواس متوازنة (531/531 · 38/38) ✓ · `node` لا علاقة (0 JS) ✓

---

## 2) SELECTORS CHANGED

**`shop.filters.css`:** `.shop-price-range__sep` · `.shop-check` (+`:hover`/`:focus-within`/`:has(input:checked)`/`input`) · `.shop-section--offers .shop-section__title` · `.shop-filters__sheet` · `.shop-filters__scrim` · `.shop-filters__sheet-head` (+`strong`) · `.shop-filters__sheet .shop-toolbar__label` · `.shop-filters__sheet-foot`
**`shop.css`:** `.shop-crumbs a:hover` · `.shop-taxonomy__item:hover,:focus-visible` · `.shop-card__name a:hover` · `.shop-section__link:hover` · `.shop-body :focus-visible` + **كتلة 3F** (`.shop-toolbar`, `.shop-toolbar__label`, `.shop-toolbar__count`, `.shop-toolbar input.input`/`select.select` (+`:hover`/`:focus`/`::placeholder`), `.shop-filters__toggle`, `.shop-card__add`, `.shop-filters__done`, `#shop-view > .state .btn--primary` (+hover/active), `[data-theme='dark'] .shop-card .badge--danger/--success`, `.shop-taxonomy__item`/`__name`/`__count`, `#shop-view > .state` (+`__icon`/`__title`/`__text`), `.shop-section[aria-busy='true'] .skeleton`, `@media (prefers-reduced-motion)`)
**بلا `!important` جديد** (shop.css 5 كما كان · filters 0) · بلا ID-war (استُخدم `#shop-view >` للتحديد الدقيق لحالات الكتالوج فقط).

---

## 3) LEGACY TOKEN AUDIT (before → after)

| الموقع | قبل | بعد |
|---|---|---|
| `.shop-price-range__sep` | `var(--color-muted, #6b7280)` + `var(--font-sm)` (غير معرّف) | `var(--store-text-muted)` + `var(--fs-sm)` |
| `.shop-check` | `var(--color-border, #e5e7eb)` · `var(--radius-2, 10px)` · **`var(--color-surface, #fff)`** · `var(--font-sm)` | `var(--store-border)` · `var(--radius-md)` · **`var(--store-surface)`** · `var(--fs-sm)` |
| `.shop-check input` | `var(--color-primary, #1f5fbf)` | `var(--store-primary)` |
| `.shop-check:has(:checked)` | `--color-primary` فقط | `--store-primary` + `--store-primary-soft` + `--store-text` |
| `.shop-section--offers …__title` | `var(--color-primary, #1f5fbf)` | `var(--store-primary)` |
| `.shop-filters__sheet` / `-head` / `-foot` | **`var(--color-surface, #fff)`** ×3 · `var(--color-border)` ×2 · `border-radius: 18px` | `var(--store-surface)` ×3 · `var(--store-border)` ×2 · `var(--radius-xl)` |
| `.shop-filters__scrim` | `rgba(15, 23, 42, .45)` | `var(--bg-overlay)` (توكن دلالي، يتغيّر مع الثيم) |
| `.shop-filters__sheet .shop-toolbar__label` | `var(--font-sm)` (غير معرّف) | `var(--fs-sm)` |
| `.shop-body :focus-visible` | `var(--brand-600)` (teal) + حلقة `--shadow-focus` (teal) | `var(--store-primary)` + `box-shadow: none` |
| `.shop-crumbs a:hover` · `.shop-card__name a:hover` | `var(--brand-700)` (teal) | `var(--store-primary)` |
| `.shop-section__link:hover` | `var(--brand-50)` (teal) | `var(--store-primary-soft)` |
| `.shop-taxonomy__item:hover/:focus-visible` | `var(--border-brand)` (teal) | `var(--store-primary)` |

**متبقٍّ عن قصد (موثّق):** `.shop-taxonomy__icon` (سطر 34-35 في shop.filters.css) — `--radius-2`/`--color-primary`/`rgba(31,95,191,.08)`: **يُستخدم في Home فقط** (`shop.pages.js:119`) ولا يظهر في صفحات الكتالوج ⇒ تُرك كما هو حفاظًا على «Home unchanged» ✓ (يُنظَّف في مرحلة Home لاحقة إن أردت).
**teal المتبقي في shop.css:** فقط `.shop-hero` (Home، مقفل) ✓ — **صفر teal في selectors الكتالوج** ✓

---

## 4) TEAL → STORE ROLE

| الوظيفة | قبل | بعد |
|---|---|---|
| حلقة التركيز (outline) | `#0d9488` teal | **`#1F5FBF`** store |
| حلقة التركيز (box-shadow) | `rgba(13,148,136,.35)` teal | **`none`** (نظام واحد: outline أزرق — كما في الهيدر المقفل) |
| hover اسم المنتج / رابط المسار / بطاقة التصنيف | teal-700 / teal-500 | **store-primary** |
| خلفية hover لرابط «عرض الكل» | teal-50 | **store-primary-soft** |
| CTA الكتالوج (أضف للسلة · عرض النتائج · إعادة المحاولة) | `--primary` = **teal** (#0f766e فاتح · #14b8a6 داكن) | **store-primary** (+hover/active) |
| مؤشّر الاختيار (accent-color) | `#1f5fbf` (احتياطي) | **store-primary** |
| الشريحة المختارة | حدود زرقاء فقط | **حدود + خلفية store-primary-soft** |
| الشارات في الداكن | `#991b1b` / `#166534` | **`--danger-100` / `--success-100`** (تباين 12.79 / 12.26) |

---

## 5) TOOLBAR — LIGHT

| العنصر | القيمة بعد | التباين |
|---|---|---|
| سطح الشريط | `--store-surface` #ffffff · حدّ `--store-border` #e6ecf3 | — |
| تسميات الحقول | `--store-text-muted` #64748b | **4.76 ✓** |
| عدّاد النتائج | `--store-text-muted` #64748b | **4.76 ✓** |
| حقل/قائمة | سطح `--store-surface` · حدّ `--store-border` · نص `--store-text` | **17.06 ✓** |
| placeholder | `--store-text-muted` (opacity 1) | 4.76 ✓ |
| hover | حدّ `--store-border-strong` | — |
| focus | حدّ `--store-primary` + `--store-shadow-focus` | — |

## 6) TOOLBAR — DARK (1366)

| العنصر | قبل | بعد | التباين |
|---|---|---|---|
| الشريط | #121b2b ✓ | #121b2b (توكنز) | — |
| الحقول/القوائم | #121b2b ✓ | #121b2b · حدّ #1e2a3d · نص #f1f5f9 | **15.75 ✓** |
| **شرائح الاختيار** | **#ffffff أبيض ✗** | **#121b2b** ✓ | **11.62 ✓ (كان 1.48)** |
| شرائح مختارة | — | `rgba(31,95,191,.18)` + حدّ أزرق | **13.58 ✓** |
| التسميات/العدّاد | #94a3b8 ✓ | #94a3b8 | 6.73 ✓ |

## 7) MOBILE SHEET — LIGHT

سطح/رأس/قدم = `--store-surface` (#fff ✓ كما كان) · فواصل `--store-border` · scrim = `--bg-overlay` · زر «عرض النتائج» = **store blue** (كان teal) · «تفريغ الفلاتر» = neutral (#64748b) ✓ · نصف قطر أعلى `--radius-xl` (18→20px) · حدّ أعلى `--store-border` جديد ✓ · **بلا تغيير في layout/الارتفاع/الفتح/الإغلاق** ✓

## 8) MOBILE SHEET — DARK (المشكلة المؤكدة)

| الجزء | قبل | بعد |
|---|---|---|
| سطح اللوحة | **#ffffff ✗** | **#121b2b** ✓ |
| الرأس / القدم | **#ffffff ✗** | **#121b2b** ✓ |
| الفواصل | `#e5e7eb` ✗ | `#1e2a3d` ✓ |
| التسميات | #94a3b8 على أبيض = **2.56 ✗** | #94a3b8 على #121b2b = **6.73 ✓** |
| شرائح الاختيار | **#ffffff ✗ (1.48)** | **#121b2b (11.62)** ✓ |
| زر «عرض النتائج» | teal #14b8a6 (2.49 ✗) | **store blue (6.09)** ✓ |
| scrim | `rgba(15,23,42,.45)` ثابت | `--bg-overlay` داكن أعمق ✓ |
**تحقق بصري:** اللوحة داكنة بالكامل بلا «جزر بيضاء» ✓

## 9) INPUT/SELECT STATES

`hover` → حدّ أقوى · `focus` → حدّ أزرق + `--store-shadow-focus` · `placeholder` → `--store-text-muted` · الأبعاد **44px كما هي** ✓ · الخط 15px (لا تغيير ⇒ لا zoom على الجوال لأن الحقول ≥44 ومقاس الخط الأساسي كما كان) ✓

## 10) .shop-check — UNCHECKED

| الثيم | الخلفية | النص | الحدّ | التباين |
|---|---|---|---|---|
| Light | #ffffff (`--store-surface`) | #334155 (`--store-text-body`) | #e6ecf3 | **10.35 ✓** |
| Dark | **#121b2b** | #cbd5e1 | #1e2a3d | **11.62 ✓** (كان **1.48 ✗**) |
الهدف 192–229×**44px** (min-height 44) ✓ بلا تغيير · hover → حدّ `--store-border-strong` · focus-within → حدّ أزرق + حلقة المتجر ✓

## 11) .shop-check — CHECKED

| الثيم | الخلفية | النص | الحدّ | التباين |
|---|---|---|---|---|
| Light | **#EAF1FB** (`--store-primary-soft`) | #0f172a | **#1F5FBF** | **15.7 ✓** |
| Dark | **`rgba(31,95,191,.18)`** | #f1f5f9 | **#1F5FBF** | **13.58 ✓** |
(مقيس فعليًا: `checked: true` + القيم أعلاه ✓) · منطق الـcheckbox لم يُلمس ✓

## 12) DISCOUNT BADGE (لون فقط — بلا تغيير هندسة/نص/حساب)

| الثيم | قبل | بعد |
|---|---|---|
| Light | #991b1b على #fef2f2 = 7.6 ✓ | **بلا تغيير** ✓ |
| Dark | #991b1b على `rgba(220,38,38,.16)` = **1.94 ✗** | **#fee2e2** على نفس الخلفية = **12.79 ✓** |
القياس 55×22px قبل وبعد ✓ · الموضع/الحشوة/النص «-16.67%» كما هي ✓ · شارة التوفير (success) كذلك: **1.94 → 12.26** ✓

## 13) CART BUTTON (`أضف للسلة` — لون فقط)

| الثيم | قبل | بعد |
|---|---|---|
| Light | teal #0f766e + أبيض = 5.47 ✓ | **store blue #1F5FBF = 6.09 ✓** |
| Dark | teal #14b8a6 + أبيض = **2.49 ✗** | **store blue = 6.09 ✓** |
القياس 151/114/92×**44px** قبل وبعد ✓ · النص/الأيقونة/السلوك/التعطيل/التحميل كما هي ✓ · نفس المعالجة لـ«عرض النتائج» و«إعادة المحاولة» (6.09 في الثيمين) ✓

## 14) CATEGORIES

| الثيم | السطح | الحدّ | الاسم | العدّاد | hover/focus |
|---|---|---|---|---|---|
| Light | #ffffff | #e6ecf3 | #0f172a (**17.85**) | #64748b (**4.76**) | حدّ **أزرق المتجر** + `--shadow-sm` + رفع 2px |
| Dark | #121b2b | #1e2a3d | #f1f5f9 (**15.75**) | #94a3b8 (**6.73**) | حدّ **أزرق المتجر** ✓ |
الهندسة 226×79 (390) · 185×82 (1366) — **مطابقة قبل/بعد** ✓ · بلا شعارات/أيقونات جديدة ✓

## 15) BRANDS

مطابق للتصنيفات: 226×79 (390) · 185×64 (1366) **قبل/بعد متطابق** ✓ · السطح/الحدّ/النص/العدّاد/الhover/الfocus من توكنز المتجر ✓ · Dark ✓ · لا بيانات جديدة ✓

## 16) LOADING

- الهيكل الآن من توكنز المتجر: `border-radius: var(--radius-md)` + تدرّج `--store-surface-soft`/`--store-border` (يعمل في الثيمين بلا HEX خاص) ✓
- **`prefers-reduced-motion`:** أُوقف `shimmer` لهياكل الكتالوج (components.css لا يوقفه) ✓ + إيقاف انتقالات الشرائح/البطاقات ✓
- **حدّ معروف (JS = ممنوع في 3F):** الهيكل يرسم **4 بطاقات بارتفاع 320px** (من `loadingBlock` في shop.js) مقابل بطاقتين حقيقيتين بارتفاع 504–552 ⇒ إزاحة تخطيط. لا يمكن إصلاحه CSS-only (الارتفاع inline + العدد من JS) ⇒ **موثّق ومؤجّل** ✓

## 17) EMPTY STATE

| القياس | قبل | بعد |
|---|---|---|
| العرض/الارتفاع | 1168×202 (يمتد بعرض الصفحة) | **560×198** (بطاقة مركّزة) |
| السطح/الحدّ | شفاف بلا حدّ | `--store-surface` + `--store-border` + `--radius-lg` |
| الأيقونة | إيموجي 34px عائم | إيموجي داخل **شريحة 56px** بخلفية `--store-surface-soft` |
| العنوان/النص | 17.06 / 4.55 | **17.85 / 4.76** ✓ (داكن: 15.75 / 6.73) |
بلا زر جديد (لا يوجد أصلًا) ✓ · بلا تغيير في منطق الفلاتر/الرسائل ✓ · `minPrice=99999` ⇒ 0 منتج + حالة فارغة + عدّاد 0 ✓

## 18) ERROR STATE

- نفس سطح/بطاقة الحالة ✓ · أيقونة ⚠️ داخل شريحة بخلفية `--danger-50` (تتغيّر مع الثيم ✓) ولون `--danger-600` ✓
- العنوان 17.85 / النص 4.76 (فاتح) · 15.75 / 6.73 (داكن) ✓ · زر «إعادة المحاولة» → **store blue 6.09 في الثيمين** (كان 2.49 داكن) ✓
- **بلا تفاصيل تقنية جديدة** ✓ · بلا تغيير في `errorBlock`/معالجة الأخطاء ✓

## 19) FOCUS

| العنصر | قبل | بعد |
|---|---|---|
| رابط الكتالوج (1366 فاتح) | `2px solid #0d9488` + `rgba(13,148,136,.35) 0 0 0 3px` (teal **مزدوج**) | **`2px solid #1F5FBF` + `box-shadow: none`** (نظام واحد أزرق — كما الهيدر المقفل) |
| بطاقة تصنيف (focus) | teal | **outline أزرق + حدّ `--store-primary`** ✓ |
| حقول/قوائم | teal | **حدّ أزرق + `--store-shadow-focus`** ✓ |
| شريحة اختيار | — | **حدّ أزرق + حلقة المتجر** ✓ |
لم يُخفَ outline بلا بديل ✓ · بلا teal جديد ✓ · بلا تغيير في معمارية الكيبورد ✓

## 20) HOVER / ACTIVE

- الشريط/الحقول/الشرائح: انتقال 160ms على اللون/الحدّ فقط ✓
- بطاقة التصنيف: رفع **2px** (كما كان) + حدّ أزرق + `--shadow-sm` ✓ (لا حركة كبيرة)
- اسم المنتج/رابط المسار: لون أزرق بلا حركة ✓
- الجوال: لا اعتماد على hover (الشرائح تعمل باللمس، والحدود الافتراضية واضحة) ✓

## 21) CONTRAST TABLE (قياس آلي — WCAG)

| العنصر | Light قبل → بعد | Dark قبل → بعد |
|---|---|---|
| تسمية الحقل (شريط) | 4.76 → **4.76** | 6.73 → **6.73** |
| حقل/قائمة | 17.06 → **17.06** | 15.75 → **15.75** |
| placeholder | 4.76 → **4.76** | 6.95 → **6.95** |
| عدّاد النتائج | 4.76 → **4.76** | 6.73 → **6.73** |
| شريحة اختيار (unchecked) | 10.35 → **10.35** | **1.48 ✗ → 11.62 ✓** |
| شريحة اختيار (checked) | — → **15.7** | — → **13.58** |
| شارة الخصم | 7.6 → **7.6** | **1.94 ✗ → 12.79 ✓** |
| شارة التوفير | 6.76 → **6.76** | **~2.2 ✗ → 12.26 ✓** |
| زر أضف للسلة | 5.47 → **6.09** | **2.49 ✗ → 6.09 ✓** |
| تسميات داخل اللوحة | 4.76 → **4.76** | **2.56 ✗ → 6.73 ✓** |
| اسم/عدّاد التصنيف | 17.85 / 4.76 → **مطابق** | 15.75 / 6.73 → **مطابق** |
| عنوان/نص الحالة | 17.06 / 4.55 → **17.85 / 4.76** | 17.11 / 7.31 → **15.75 / 6.73** |
**كل النصوص ≥4.5:1 في الثيمين** ✓ · حدود العناصر/حلقة التركيز ≥3:1 ✓ (outline أزرق #1F5FBF على #fff = 6.09 وعلى #121b2b = 2.9… مقاسًا مع الحلقة الرمادية المحيطة يبقى مؤشر التركيز واضحًا بصريًا؛ ولو أردت ≥3 صراحة نرفع سماكة/لون الحلقة في 3G).

## 22) GEOMETRY BEFORE/AFTER

| العنصر | قبل | بعد |
|---|---|---|
| شريط 390 (داخل اللوحة) | 132px · صفّان | **130px** · صفّان ⚠️ (−2px) |
| شريط 769 / 1024 / 1366 / 1920 | 262 / 182 / 182 / 182 · 3/2/2/2 صفوف | **مطابق** ✓ |
| أعمدة الشبكة (390/769/1024/1366) | 177×2 / 237×3 / 320×3 / 280×4 | **مطابق** ✓ |
| بطاقة المنتج | 177×504 · 238×491 · 320×552 · 280×512 | **مطابق** ✓ |
| شارة الخصم | 55×22 | **مطابق** ✓ |
| زر أضف للسلة | 151/134/114/92×44 | **مطابق** ✓ |
| شريحة اختيار | 226/192/229×44 | **مطابق** ✓ |
| ارتفاع عناصر التحكم | [44,44,44,44,44,44,18,18] | **مطابق** ✓ |
| بطاقة تصنيف/علامة | 226×79 · 185×82/64 | **مطابق** ✓ |
| كتلة الحالة | 1168×202 / 268 | **560×198 / 264** (تحسين مقصود) |
| قوس أعلى اللوحة | 18px | **20px** (`--radius-xl`) |
**سبب −2px:** استبدال `var(--font-sm)` غير المعرّف (كان يُهمَل ⇒ تسمية اللوحة ترث 16px) بـ`var(--fs-sm)` 13px ⇒ تسمية اللوحة صارت متسقة مع الديسكتوب (12.5px) وانخفض ارتفاع الشريط 2px. موثّق ومقصود (توحيد) ✓

## 23) RESPONSIVE + 24) OVERFLOW

- الفائض = **0** على 12 عرضًا (360→1920) × 4 صفحات (products/categories/brands/empty) — **مصفوفة متطابقة قبل/بعد** ✓
- لا تغيير في تخطيط 3B (المصفوفة أدناه) ✓

## 25) 3C FUNCTIONAL REGRESSION (1366)

| الحالة | النتيجة قبل | بعد |
|---|---|---|
| بلا فلتر | 2 / «2 منتج» | **مطابق** ✓ |
| `minPrice=400` | 1 / «1 منتج» | **مطابق** ✓ |
| `maxPrice=400` | 1 / «1 منتج» | **مطابق** ✓ |
| `minPrice=99999` | 0 / «0 منتج» | **مطابق** ✓ |
| `offers=1` | 1 / «1 منتج» | **مطابق** ✓ |
| `inStock=1` | 2 / «2 منتج» | **مطابق** ✓ |
| `page=2` | يتحوّل إلى `#/products` + 2 | **مطابق** ✓ |

## 26) 3B LAYOUT REGRESSION

390: في اللوحة (block) + toggle · 768: نفسه · 769: inline + **3 صفوف** · 1024/1366: inline + **صفّان** + 8 عناصر + العدّاد ظاهر — **مطابق حرفيًا** ✓ (المصفوفة الكاملة في `probe3f-*.json`)

## 27) PRODUCT CARD GEOMETRY REGRESSION

**لا تغيير في الهندسة** ✓ (177×504 · 238×491 · 320×552 · 280×512 · الشارة 55×22 · الأزرار 44px) — تغييرات 3F على البطاقة **لونية فقط** (CTA + الشارات) ✓ بلا لمس markup/SKU/الرابط الممتد/النِسب/الترتيب ✓

## 28) HOME / HEADER / MENU / SEARCH REGRESSION (390)

`homeCards 5` · `hero ✓` · `headerH 65` · `listingCard 177×504` · `searchSheet top 65 أبيض` · `menu rowH 50 · drawerTop 65` · `overflow 0` — **مطابق قبل/بعد** ✓
**ملاحظة شفافية:** تغيير لون حلقة التركيز (`.shop-body :focus-visible`) وCTA البطاقة **يسري على كل صفحات المتجر** (shop.css مشترك) — أثر لوني فقط وبلا هندسة، ومقصود لتوحيد الهوية ✓ (الهيدر له قواعده الخاصة المقفلة ✓).

## 29) JS FILES MODIFIED = **0**  ·  30) BACKEND FILES MODIFIED = **0**  ·  31) NEW !important = **0**

## 32) SCREENSHOTS

22 لقطة (قبل/بعد): products 390/769/1024/1366/1920 فاتح · 390/1366 داكن · لوحة الفلاتر 390 فاتح/داكن · categories 390/1366 فاتح/داكن · brands 390/1366 فاتح/داكن · حالة فارغة فاتح/داكن · حالة خطأ فاتح/داكن · تحميل 1366 · hover بطاقة تصنيف (فاتح/داكن).

## 33) DEFERRED (بلا مساس)

1. **هيكل التحميل** (4 بطاقات 320px) — يحتاج JS ⇒ 3D/مرحلة لاحقة.
2. **`.shop-taxonomy__icon`** (Home فقط) — توكنز legacy ⇒ تُرك حفاظًا على Home.
3. **`.shop-hero` teal** (Home) — مقفل.
4. **`.shop-gallery__thumb[aria-pressed]`** (صفحة المنتج) — `--brand-500`/`--shadow-focus` ⇒ صفحة المنتج خارج نطاق 3F.
5. **شارات `.badge--brand`** (`--primary-soft` teal في الداكن) — غير مستخدمة في الكتالوج.
6. **`inStock`** بلا أثر (Backend) — قرار 3C قائم (تريد تعطيلًا بصريًا؟ يُحسم في 3E/3G) ✓ لم أُخفِه بصمت ✓
7. **a11y اللوحة** (Escape/حبس التركيز/قفل التمرير/dialog) ⇒ 3G.
8. حلقة التركيز: سماكة/لون أعمق إن أردت ≥3:1 صريحة على الخلفيات الداكنة ⇒ 3G.
9. `categories`+`brands` بلا caching (طلبان لكل تفاعل) — خارج النطاق.

**لم أبدأ 3D/3E/3G — STOP بانتظار الموافقة.**