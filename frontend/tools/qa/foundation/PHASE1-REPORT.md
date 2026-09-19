# PHASE 1 — TAILWIND FOUNDATION + CAIRO + DESIGN SYSTEM + APP SHELL
### IMPECCABLE · NEW STOREFRONT REBUILD · تقرير التنفيذ

---

## 1) FILES CREATED

| الملف | الغرض |
|---|---|
| `frontend/package.json` | إعداد الواجهة + سكربتات البناء (`tw:build` · `tw:watch` · `tw:dev`) |
| `frontend/package-lock.json` | قفل الإصدارات |
| `frontend/tailwind/input.css` | **المصدر الوحيد للطبقة الجديدة** (توكنز + base + components) |
| `frontend/tailwind/README.md` | توثيق عملي (تثبيت · أوامر · مسح · ثيم · RTL · نشر) |
| `frontend/shop/assets/css/shop.tw.css` | **المخرج المُولَّد** (مضغوط — لا يُحرَّر يدويًا) |
| `frontend/assets/fonts/Cairo-Regular.woff2` | Cairo مُجزَّأ من الأصل المحلي (‎−81%‎) |
| `frontend/tools/qa/foundation/harness.js` | حاضنة QA للأساس (تُمسح من Tailwind لتوليد أدوات الاختبار) |
| `frontend/tools/qa/foundation/contract.py` | **عقد DOM/السلوك** — 58 فحصًا آليًا |
| `frontend/tools/qa/foundation/{make_font,debug_btn,debug_zoom,shots}.py` | أدوات مساندة (تحويل الخط · تشخيص · لقطات) |
| `frontend/tools/qa/foundation/contract-results.json` | نتائج آخر تشغيل |
| `frontend/node_modules/` | أدوات البناء (**لا تُنشر** — ليست جزءًا من الموقع) |

## 2) FILES MODIFIED

| الملف | التعديل |
|---|---|
| `frontend/shop/index.html` | إضافة `<link rel="stylesheet" href="assets/css/shop.tw.css">` (آخر `<head>`) |
| `frontend/assets/css/base.css` | `@font-face` لـCairo: **WOFF2 أولًا + TTF كبديل آمن** |

**لم يُلمس:** الملفات الخمسة القديمة للمتجر · `tokens.css` · `components.css` · `layout.css` · أي ملف JS · أي شيء في الـbackend/API/DB/routes.

## 3) DEPENDENCIES INSTALLED

**تنموية فقط (devDependencies):** `tailwindcss@4.3.3` · `@tailwindcss/cli@4.3.3` (+ شجرة تبعياتهما، ‎20 MB‎ على القرص).
**تبعيات وقت التشغيل المُضافة للمتصفح = 0** ✗ (لا شيء يُشحن للمستخدم) · **لا CDN** ✓ · **لا Vite/Webpack/React/Vue/Next/Svelte** ✓.

## 4) TAILWIND VERSION
**v4.3.3** (CSS-first · `@theme` · بلا `tailwind.config.js`).

## 5) BUILD ARCHITECTURE
```
tailwind/input.css  ──(npx tailwindcss --minify)──▶  shop/assets/css/shop.tw.css  ──nginx──▶ المتصفح
        ▲                                                        ▲
   المصدر (يُحرَّر)                                     المخرج الثابت (يُقدَّم + يُخزَّن)
```
- **بلا preflight** ✗ (`@import "tailwindcss/theme.css" layer(theme)` + `utilities` بلا طبقة) ⇒ لا يُعاد تعيين الصفحات القديمة ولا لوحة الإدارة.
- **درس معماري مُثبت بالقياس:** `base.css` القديم يحوي قواعد **غير مُطبَّقة في طبقة** مثل `button { background:none }`، وقواعد الطبقات تخسر أمامها دائمًا (حتى بأولوية أعلى) ⇒ أُصدِرت كل طبقات المتجر الجديد **unlayered**، وكل محدّداتها مسبوقة بـ`.stw` أو بأسماء `stw-*` ⇒ تفوز داخل نطاقها بلا `!important` وبلا حرب أولويات.

## 6) DEVELOPMENT COMMAND
```bash
cd /root/alwled/frontend && npm run tw:watch
```

## 7) PRODUCTION COMMAND
```bash
cd /root/alwled/frontend && npm run tw:build      # ⇒ shop/assets/css/shop.tw.css (مضغوط)
```

## 8) GENERATED CSS SIZE
| | الحجم |
|---|---|
| `shop.tw.css` **raw** | **21.63 KB** (22,152 B) |
| **gzip** | **4.90 KB** (5,016 B) |
| (مرجع) CSS القديم للمتجر | 241 KB خام / 51 KB gzip |

## 9) SOURCE SCANNING STRATEGY
```css
@source "../shop/**/*.{html,js}";
@source "../assets/js/**/*.js";
@source "../../tools/qa/**/*.js";   /* حاضنة QA */
```
**إلزامي مسح JS** لأن الـDOM مُولَّد من JS — أُثبت في Phase 0 أن مسح HTML وحده ينتج 1.9 KB بلا أي صنف ✗.

## 10) NEW COLOR TOKENS
`primary` · `primary-hover` · `primary-active` · `primary-soft` · `on-primary` · `bg` · `surface` · `elevated` · `surface-muted` · `ink` · `ink-muted` · `ink-subtle` · `line` · `line-strong` · `success(-soft)` · `danger(-soft)` · `warning(-soft)` · `info(-soft)` · `focus` — **19 توكنًا لونيًا** (مسبوقة `--color-*` ⇒ تولّد أدوات Tailwind ✓ ولا تصادم مع القديم ✓).

## 11) LIGHT PALETTE
`primary #FFBF17` · hover `#E9AA00` · active `#D39900` · soft `#FFF6D8` · on-primary `#171717` · bg `#F7F7F5` · surface `#FFFFFF` · elevated `#FFFFFF` · surface-muted `#F2F2EF` · ink `#171717` · ink-muted `#626262` · ink-subtle `#8A8A8A` · line `#E5E5E2` · line-strong `#D4D4CF` · focus `#D39900`.

## 12) DARK PALETTE
`bg #101112` · surface `#18191B` · elevated `#1E1F22` · surface-muted `#202124` · ink `#F5F5F4` · ink-muted `#A3A3A0` · ink-subtle `#7C7C79` · line `#2A2B2E` · line-strong `#3A3B3F` · **primary يبقى `#FFBF17`** ✓ · on-primary يبقى `#171717` ✓ · soft `rgba(255,191,23,.14)` · focus `#FFBF17` — الدلالية (success/danger/warning/info) تبقى بألوانها الدلالية ✓ (**لا أصفر في الحالات الدلالية** ✓).

## 13) TYPOGRAPHY SCALE (13 دورًا دلاليًا · Cairo · بلا letter-spacing)
| الدور | القيمة | الوزن |
|---|---|---|
| display | `clamp(1.75rem, 1.15rem+2.2vw, 2.75rem)` / 1.15 | 700 |
| page-title | `clamp(1.375rem, 1.15rem+1.1vw, 1.875rem)` / 1.25 | 700 |
| section-title | `1.25rem` / 1.35 | 700 |
| product-title | `0.9375rem` / 1.45 | 600 |
| body-lg | `0.9375rem` / 1.6 | 400 |
| body | `0.875rem` / 1.65 | 400 |
| label | `0.8125rem` / 1.4 | 500 |
| meta | `0.8125rem` / 1.55 | 400 |
| caption | `0.75rem` / 1.5 | 400 |
| button | `0.875rem` / 1.25 | 600 |
| price-lg | `clamp(1.5rem, 1.2rem+1vw, 2rem)` / 1.2 | 700 |
| price | `1.125rem` / 1.25 | 700 |
| price-sm | `0.9375rem` / 1.3 | 700 |

كلها `rem`/`clamp` ⇒ تكبير النص يعمل ✓ · line-height عربي مريح (1.5–1.65) ✓ · **`letter-spacing: 0`** ✓.

## 14) CAIRO IMPLEMENTATION
- **الخط الأساسي للمتجر**: `--font-store: 'Cairo', Tahoma, …` ✓ ويُطبَّق على `.stw` ✓.
- **مُضمَّن محليًا** ✓ (`assets/fonts/`) — **لا** CDN ولا خطوط Google ولا تنزيل جديد ✓ (الـWOFF2 مُولَّد من **نفس الأصل المحلي المصرّح** ✓).
- **التحسين:** `Cairo-Regular.woff2` = **113.9 KB** (من 585.5 KB = ‎−81%‎) مع **تغطية عربية 100%** (102/102 محرفًا + **195/195 شكل عرض** ✓ + لاتيني ✓ + عملة/ترقيم ✓) — **TTF كبديل آمن** في نفس `@font-face` ✓.
- مُتحقَّق وقت التشغيل: `Cairo/400 700/loaded` ✓ · **طلب واحد فقط** `Cairo-Regular.woff2:114KB` ✓ · **لا طلب TTF** ✓.
- **الحقيقة بلا تجميل:** ملف واحد يغطّي المدى 400–700 ⇒ الأوزان **400 و700 أصلية**، والوسيطة **500/600 قد يُصنّعها المتصفح** (synthetic) ✗ — مُوثَّق ولم يُدَّعَ غير ذلك ✓.

## 15) RTL STRATEGY
`dir="rtl"` كما هو ✓ · **خصائص منطقية حصرًا**: `ms/me` · `ps/pe` · `start/end` · `inset-inline-*` · `padding-inline` ✓ · لا CSS مكرّر LTR/RTL ✓ · لا `left/right` في الطبقة الجديدة ✓ · سهم القائمة المنسدلة **يسار** (RTL) ✓ · الأسعار/الأرقام معزولة bidi + أرقام جدولية ✓.

## 16) RESPONSIVE / CONTAINER STRATEGY
- **الحاوية: `--container-store: 1360px`** (مختارة داخل النطاق الموصى به 1280–1440 ✓ — توازن بين كثافة المنتجات الأربعة والقراءة المريحة) + حشوة متجاوبة 16/24/32.
- نقاط الكسر: **افتراضي Tailwind فقط** (base · `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`) — **لا نقاط مخصّصة** ✓.
- **مُختبرة فعليًا: 15 عرضًا** (360 · 390 · 430 · 600 · 640 · 768 · 769 · 900 · 1023 · 1024 · 1280 · 1366 · 1440 · 1536 · 1920) ⇒ **فائض أفقي = 0** ✓.

## 17) RADIUS SYSTEM
`--stw-radius-sm: 6px` (شرائح/رقائق) · `md: 10px` (تحكّمات) · `lg: 14px` (بطاقات/أسطح) · `xl: 20px` (لوحات كبيرة) — **بلا استدارة فقاعية** ✓ · `pill` **فقط** للشارات/الشرائح ✓ (مُتحقَّق: الزر الأساسي نصف قطره 10px ✗ ليس 999px ✓).

## 18) SHADOW SYSTEM
**الحدّ أولًا** ✓ — 4 ظلال فقط (`xs` · `sm` · `md` · `overlay`) وللطبقات العائمة (قائمة/دُرج/مودال/بحث/توست) ✓ — **بطاقات المنتجات لا تعتمد على ظل دائم** ✓.

## 19) MOTION SYSTEM
عقد مُصدَّر في `:root` صراحةً (لا يعتمد على tree-shaking ✓): `--duration-instant 90ms` · `fast 150ms` · `base 200ms` · **`slow 240ms`** · `panel 240ms` · **`focus-return 60ms`** — أي **توقيت JS↔CSS من Phase 0 محفوظ** ✓ (240ms لإغلاق لوحة البحث · 60ms لإرجاع التركيز) ولم يُكسر ✓.
`prefers-reduced-motion`: كل الانتقالات/الحركات تُعطَّل ✓ (مُتحقَّق: `1e-05s` في الثيمين ✓).

## 20) BUTTON / FORM FOUNDATION
- **أزرار:** `primary` (ذهبي + نص `#171717`) · `secondary` (فحمي) · `outline` · `ghost` · `danger` + `sm/lg/block/icon` + `:disabled` محايد واضح ✓ · **44px** هدف لمس ✓ · **`height: auto` + حشوة رأسية** ⇒ النص المتعدّد الأسطر ينمو بدل أن يُقصّ ✓ (عيب اكتُشف وأُصلح بالقياس عند 200% ✓).
- **حقول:** `stw-field` (44px · **16px** ⇒ لا تكبير iOS ✓) · `stw-select` (سهم SVG محلي · RTL ✓) · `stw-choice` (checkbox/radio بـ`:has()` + `accent-color`) · `stw-label`/`stw-help`/`stw-error` + حالات hover/focus/invalid/disabled ✓.
- حلقة التركيز موحّدة `2px` بلون `--color-focus` + `outline-offset: 2px` ✓.

## 21) APP SHELL CHANGES
- تحميل الطبقة الجديدة في `shop/index.html` ✓ (**آخر `<head>`** — لا تتغلّب على القديم ✓).
- **كل هوكات التشغيل محفوظة**: `#shop-view` ✓ · `#shop-toasts` ✓ · `data-theme` ✓ · `data-api-base` ✓ (مُتحقَّق في الاختبارات ✓).
- **لا إعادة تصميم** للهيدر/التذييل/أي صفحة ✓ (مقصود في هذه المرحلة ✓).
- الجذر المستقبلي للتصميم الجديد: `.stw` (+ `.stw-container`) — جاهز للمراحل التالية ✓.

## 22) DOM CONTRACT TESTS CREATED
`tools/qa/foundation/contract.py` (Playwright) — **58 فحصًا** في 7 مجموعات:
**A** المسارات (11) + الفائض · **B** عقد المعرّفات (هيدر/دُرج/بحث/كتالوج) + قفل التمرير · **C** PDP (صدق التوفّر · الكمية · المسار · المشابهة) + مودال المصادقة + سلوك 633 · **C2** الكتالوج على الديسكتوب (inline بلا toggle) · **D** الثيم (data-theme + localStorage + is-active + البقاء) · **E** الأساس الجديد (الثيمين: Cairo · #FFBF17 · 44px · 16px · التباين · الداكن · المعطّل · 200% · reduced-motion · الخط) · **F** 15 عرضًا · **G** لوحة الإدارة.
**تحمي سلوكًا لا شكلًا** ✓ (لا تفحص CSS قديمًا ✓) + كل دلالات الإتاحة من Phase 0 ✓.

## 23) TESTS EXECUTED + RESULTS
```
=== النتيجة: 58/58 نجحت ===      (exit 0)
```
تشمل: `#shop-view` ✓ · الدُرج يفتح + `is-open` + قفل تمرير ✓ · البحث يفتح ويُرجِع نتائج ✓ · `aria-expanded` متزامن ✓ · لوحة الفلاتر `role=dialog`+`aria-modal`+حبس تركيز+Escape+إرجاع ✓ · **633: CTA معطّل أصلي بنص «غير متوفر حاليًا» + لا مودال + 0 طلب سلة** ✓ · **632: CTA مفعّل + مودال مصادقة بدلالات كاملة** ✓ · `?inStock=1` لا يكسر ✓ · لا تحكّم inStock مرئي/قابل للتركيز ✓ · الثيم يُحفظ ✓ · **0 console errors** في كل الأسطح ✓.

## 24) ACCESSIBILITY CHECKS
`role=dialog` ✓ · `aria-modal` ✓ · `aria-labelledby` ✓ · `aria-expanded` ✓ · `aria-controls` ✓ · `aria-current` ✓ · `aria-busy` ✓ · `role=status`/`role=alert` ✓ · `disabled` أصلي ✓ · حلقة تركيز مرئية ✓ · `sr-only` ✓ · `skip-link` ✓ · أهداف لمس ≥44 ✓ · تباين: **الزر الأساسي 10.9:1** ✓ · المتن 16.7:1 ✓ · الخافت 5.69:1 ✓ (**لا نص أبيض على الأصفر** ✗ — ممنوع ✓).

## 25) RESPONSIVE WIDTHS TESTED
**15 عرضًا**: 360 · 390 · 430 · 600 · 640 · 768 · 769 · 900 · 1023 · 1024 · 1280 · 1366 · 1440 · 1536 · 1920 ⇒ **فائض أفقي = 0** ✓ · الحاوية ≤1360 ✓ · هدف اللمس ≥44 في كلها ✓.

## 26) LIGHT / DARK RESULTS
| | فاتح | داكن |
|---|---|---|
| سطح البطاقة | `rgb(255,255,255)` ✓ | `rgb(30,31,34)` ✓ |
| الزر الأساسي | `rgb(255,191,23)` + نص `rgb(23,23,23)` ✓ | نفسه ✓ (الهوية تُحفظ في الثيمين ✓) |
| تباين الزر الأساسي | **10.9:1** ✓ | **10.86:1** ✓ |
| الزر المعطّل | محايد `rgb(32,33,36)`/`rgb(124,124,121)` ✓ | ✓ |
| console | 0 ✓ | 0 ✓ |

## 27) 200% ZOOM RESULT
**يعمل**: الأزرار تنمو (‎44 → 107 → 135px‎) بلا قصّ (`ovX=0` · `ovY=0` ✓) · الحقول/صفوف الاختيار بلا فائض ✓ · **فائض أفقي للصفحة = 0** ✓ في الثيمين ✓.
(عيب حقيقي اكتُشف بالقياس أثناء الاختبار: النص المتعدّد الأسطر كان يقصّ 8px ⇒ أُصلح بـ`height:auto` + حشوة رأسية ✓.)

## 28) REDUCED-MOTION RESULT
`prefers-reduced-motion: reduce` ⇒ كل الانتقالات `1e-05s` ✓ (مُتحقَّق برمجيًا في الثيمين ✓).

## 29) ADMIN / SHARED-CSS REGRESSION STATUS
- لوحة الإدارة تُحمَّل ✓ · **0 console errors** ✓ · فائض أفقي 0 ✓.
- `--primary` في الأدمن **ما زال `#0f766e`** ✓ (لم يُلمس) · `--store-primary` كما هو ✓ · `tokens.css`/`components.css`/`layout.css` **بلا أي تعديل** ✓.
- `base.css`: تعديل **إضافي فقط** (مصدر WOFF2 قبل TTF ✓) — يحسّن الأدمن أيضًا ✓ ولا يكسر شيئًا ✓.

## 30) REMAINING KNOWN LIMITATIONS
1. **الأوزان 500/600 في Cairo مُصنّعة** ✗ (ملف واحد 400–700) — يحتاج ملفات وزن منفصلة لاحقًا (قرار منفصل ✓).
2. **الصفحات القديمة تبدو كما هي** ✓ (مقصود: الطبقة الجديدة لا تتغلّب على القديم حتى يُرحَّل كل مكوّن ✓).
3. **`Cache-Control: no-store`** على كل الأصول ✗ (خارج نطاق Phase 1 — يخصّ مرحلة الأداء ✓).
4. **القرص 94%** ✗ (‎node_modules = 20MB‎ — يجب مراقبته ✓).
5. **`NODE_ENV=development`** على الـAPI ✗ (خارج النطاق ✓).
6. بيانات المنتجات ما زالت اختبارية بلا صور/أوصاف ✗ ⇒ لا يُحكم على جودة بطاقة المنتج بصريًا الآن ✓.
7. `modal__close` القديم 34px ✗ — **يُصلح عند ترحيل مودال المصادقة** (نظام الأزرار الجديد يوفر البديل 44px ✓) — لم يُلمس القديم قسرًا ✓.
8. الطبقة الجديدة **غير مرئية للمستخدم النهائي** في هذه المرحلة (مقصود ✓).

## 31) BUSINESS / API BEHAVIOR — CONFIRMATION
**لم يُغيَّر أي شيء**: backend = 0 · API = 0 · DB = 0 · routes = 0 · أي ملف JS = 0 ✓.
**مؤكَّد باختبارات العقد:** صدق `inStock` (633 معطّل · 632 مفعّل ✓) · لا تحكّم inStock مرئي ✓ · `offers` لم يُدَّعَ كفلتر كامل ✓ · لا بيانات/وعود مُختلقة (صور/تقييمات/شحن/دفع/ندرة) ✓.

---

SOURCE FILES MODIFIED = 2 (`shop/index.html` · `assets/css/base.css`)
FILES CREATED = 10 (+ node_modules لأدوات البناء)
BUSINESS LOGIC CHANGED = 0
BACKEND / API / DB / ROUTES = 0
JS FILES MODIFIED = 0
TAILWIND = v4.3.3 (محلي · بلا CDN)
GENERATED CSS = 21.63 KB raw / 4.90 KB gzip
DOM CONTRACT = 58/58 PASS
