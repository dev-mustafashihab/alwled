# PHASE 2 · STEP 2E — MOBILE SEARCH SHEET UX REDESIGN
**تقرير تنفيذ وقياس — لوحة بحث الجوال في متجر alwled**
التاريخ: 2026-09-18 · النطاق: العرض البصري لبحث الجوال · الموديل: deepseek/deepseek-v4.1-flash

---

## 0) الخلاصة

لوحة البحث صارت **workspace** بهوية المتجر الزرقاء بدل teal: سطح أبيض بلا gradient، حقل 48px بسطح ناعم وحدّ أزرق عند التركيز، زر مسح **44×44** (كان 40) وزر إغلاق بنفس لغة أزرار الهيدر، شرائح اقتراحات بهدف 44px، وصف نتيجة بحث كثيف **90px** بصورة **68px** و`object-fit: contain`، وهيكل تحميل بشكل الصف نفسه (صورة + سطران) بنبضة هادئة بدل shimmer. أُصلح خللان بصريان حقيقيان: **✕ أصلي مكرر داخل الحقل**، و**حلقة تركيز teal** حول حقل أزرق. كل المنطق والإتاحة كما هي.

- **ملف واحد معدّل:** `frontend/shop/assets/css/shop.search.css` (قسم جديد، داخل `max-width:1023px`)
- **صفر JS · صفر markup · صفر منطق · صفر `!important` جديد** (الملف 0 أصلاً) · Console 0
- **debounce 300ms مقيس قبل/بعد: 681ms → 681ms** (نفس القيمة — لم يتغير شيء في المنطق)

---

## 1) الملفات المعدّلة

| ملف | التعديل |
|---|---|
| `shop/assets/css/shop.search.css` | قسم `PHASE 2 · STEP 2E` (كل القواعد داخل `@media (max-width: 1023px)`) + `@keyframes shop-search-pulse` |
| `tools/qa/stage2e/*` | أدوات قياس + لقطات (غير تابعة للتطبيق) |

**لم يُلمس:** أي JS · `index.html` · `shop.header.css` (آخر تعديل 2D.1) · `shop.home.css` · `tokens.css` · أي helper مشترك (`productCardModel`/`imageNode`).
إثبات النطاق: `find frontend -newermt "2026-09-18 14:35" -not -path "*/tools/*"` ⇒ ملف واحد.

---

## 2) DOM الحقيقي للبحث (كما هو — لم يُلمس)

```
#shop-search-sheet (fixed · top = --hdrmenu-top = 65px · bottom 0 · z-index modal)
├─ .shop-search-sheet__head            (flex · gap 8 · padding 12px · حدّ سفلي)
│  ├─ .shop-search-sheet__field        (relative · flex 1)
│  │  ├─ .shop-search-sheet__field-icon (absolute start 12px · svg 20px · pointer-events none)
│  │  ├─ input#shop-search-sheet-input  (type=search · height 48 · font 16)
│  │  └─ button#shop-search-clear       (absolute end · hidden حتى كتابة نص)
│  └─ button#shop-search-close          (44×44)
└─ .shop-search-sheet__body            (flex 1 · overflow-y auto ← منطقة التمرير الوحيدة)
   ├─ #shop-search-suggest .shop-search-sheet__section
   │  ├─ p.shop-search-sheet__label «اقتراحات من المتجر»
   │  └─ #shop-search-suggest-list ⇒ .shop-search-chips (5 شرائح: تصنيفان + علامتان + «كل المنتجات»)
   └─ #shop-search-results  ← يُبنى من JS:
        ├─ p.shop-search-sheet__label[role=status][aria-live=polite][aria-atomic=true] «نتائج (N)»
        └─ .shop-search-results ⇒ a.shop-search-row[role=option]
             ├─ span.shop-search-row__media  (صورة أو أيقونة صندوق)
             ├─ span.shop-search-row__main   (‎__name بسطرين + __meta سطر واحد)
             └─ span.shop-search-row__price
   حالات JS: renderLoading (3× .shop-search-skeleton داخل .shop-search-results[aria-busy=true])
             renderState (‎.shop-search-state[role=status] + أيقونة + عنوان + نص + CTA)
```
**قبل الكتابة:** لا Recent · لا Popular · لا محتوى مُخترع — فقط «اقتراحات من المتجر» (تصنيفات/علامات حقيقية من الـAPI) + «كل المنتجات».

---

## 3) Search Sheet — قبل/بعد

| | قبل | بعد |
|---|---|---|
| `top` | 65px (= headerBottom) | **65px** ✓ |
| الارتفاع | 779px (844-65) | 779px |
| الخلفية | `--bg-app` = `#f8fafc` | **`--store-surface` = `#ffffff`** (بلا gradient) |
| رأس اللوحة | 73px · bg `--bg-surface` · حدّ `--border-subtle` | 73px · bg `--store-surface` · حدّ **`--store-border`** |
| عنوان ضخم | لا يوجد (كما هو) | لا يوجد ✓ |

## 4) Input — قبل/بعد

| | قبل | بعد |
|---|---|---|
| المقاس | 314×48 (390px) | 314×48 ✓ |
| الخط | 16px ✓ (بلا تكبير iOS) | 16px ✓ |
| الخلفية | `#ffffff` | **`--store-surface-soft`** |
| الحدّ (تركيز) | **teal** `#14b8a6` | **`--store-primary` #1F5FBF** |
| الحدّ (بلا تركيز) | `--border-default` | `--store-border` |
| الحشوة | 44 / 44 | 44 / **52** (مساحة زر المسح 44) |
| Placeholder | افتراضي المتصفح | **`--store-text-muted`** صريحاً (4.76:1 فاتح · 6.73:1 داكن) |
| حلقة التركيز | teal `--shadow-focus` | **`--store-shadow-focus`** (أزرق 30% — توكن نظام موجود) |
| ✕ الأصلي للمتصفح | **ظاهر** (⇒ مسحان لنفس الوظيفة) | **مُخفى** (`::-webkit-search-cancel-button`) |
| radius | 8px | 8px (بلا تغيير) |

## 5) Close / Clear — قبل/بعد

| | قبل | بعد |
|---|---|---|
| Close | 44×44 · bg `--bg-surface-2` · **حدّ ظاهر** · hover **teal** | 44×44 · `--store-surface-soft` · **حدّ شفاف** · hover/focus `--store-primary-soft` + أزرق المتجر |
| Clear | **40×40** · inset 4px · أيقونة 18px · hover `--bg-surface-2` | **44×44** · inset 2px · أيقونة 19px · hover/focus أزرق المتجر |
| منطق المسح | — | **كما هو** (يفرّغ الحقل · يعيد الاقتراحات · يعيد التركيز — مُختبر) |

## 6) Suggestions — قبل/بعد

| | قبل | بعد |
|---|---|---|
| عدد الشرائح | 5 (بيانات حقيقية) | 5 |
| ارتفاع الشريحة | **40px** | **44px** (هدف اللمس ≥44) |
| الخلفية/الحدّ | أبيض + حدّ `--border-subtle` | **`--store-surface-soft` + بلا حدّ** |
| اللون/hover | `--text-body` · hover **teal** | `--store-text` · hover/focus أزرق المتجر |
| هيكل التحميل | كتلة 40px بـshimmer | كتلة ناعمة (pill) بنبضة هادئة |

## 7) Result Row — قبل/بعد

| | قبل | بعد |
|---|---|---|
| الارتفاع | **87 / 74** (متغيّر) | **90** (ثابت — داخل الهدف 88–104) |
| الأعمدة | 56px / 1fr / auto | **68px** / 1fr / auto |
| min-height · padding | 72px · 8/12 | **88px** · 10/12 |
| الصورة | 56×56 · **`object-fit: cover`** (قص) | **68×68** · **`object-fit: contain`** · bg `--store-surface-soft` |
| الاسم | 15px/600 · سطران (clamp) | 15px/600 · سطران ✓ · `--store-text` |
| الميتا | 12.5px · قد يمتد | 12.5px · **سطر واحد + ellipsis** · `--store-text-muted` |
| السعر | 15px/700 | **16px/700** · `--store-text` (أوضح عنصر بعد الاسم) |
| الحدّ/الزوايا | `--border-subtle` · radius-lg | **`--store-border`** · **`--radius-md`** |
| الظل | none | **none** (بلا ظل — فاصل بحدّ رقيق) |
| hover/focus | bg `--bg-surface-2` + حدّ **teal** | bg `--store-surface-soft` + حدّ **أزرق المتجر** + حلقة النظام |
| سعر قديم/خصم | **غير موجود في صف البحث أصلاً** (الـmodel يوفّرهما لكن الصف لا يعرضهما) — لم أُضف شيئاً |
| سلوك الفتح | `a[href]` → مسار المنتج · onclick يغلق اللوحة | **كما هو** ✓ |

## 8) الكثافة (390×844)

| | قيمة |
|---|---|
| ارتفاع منطقة التمرير | 706px (بعد 73px للرأس) |
| ارتفاع الصف + الفاصل | 90 + 8 = **98px** |
| **سعة العرض قبل التمرير** | **6 صفوف** (label + 6×98 = 614 ≤ 666) |
| نتائج فعلية معروضة | **2** (المتجر يحتوي منتجَين فقط — لا يمكن اختبار 4+ ببيانات حقيقية) |

## 9) Loading — قبل/بعد

| | قبل | بعد |
|---|---|---|
| عدد الهياكل | 3 | 3 (نفس الـmarkup) |
| الشكل | كتلة 72px · shimmer يتحرك أفقياً | **صف 88px بحدّ وزوايا** + طبقات CSS ترسم **صورة 68px + سطران** |
| الحركة | `shop-search-shimmer` 1.2s | **نبضة هادئة `shop-search-pulse` 1.6s (opacity)** |
| reduced-motion | animation: none | **animation: none** ✓ |
| aria | `aria-busy=true` + label «جارٍ البحث» · **بلا aria-live** | **كما هو** ✓ (بلا spam لقارئ الشاشة) |

## 10) Empty / Error — قبل/بعد

| | قبل | بعد |
|---|---|---|
| الحشوة/الزوايا | 24/16 · radius-lg | **32/20 · `--radius-md`** |
| الحدّ | dashed `--border-subtle` | dashed **`--store-border`** |
| أيقونة | `--text-faint` | `--store-text-muted` — و**الخطأ**: `--danger-600` (لمسة دلالية فقط، بلا رسالة تقنية) |
| العنوان/النص | `--text-strong` / `--text-muted` | `--store-text` / `--store-text-muted` |
| CTA | **teal** `#0f766e` | **`--store-primary` #1F5FBF** (44px) |
| live region | `role=status`+`polite`+`atomic=true` | **محفوظ في الحالتين** ✓ |

## 11) Scroll model

| | قبل | بعد |
|---|---|---|
| منطقة التمرير | `.shop-search-sheet__body` (flex 1 · overflow-y auto) | **نفسها** (لم يتغيّر أي عنصر) |
| عدد مناطق التمرير | **1** | **1** |
| الرأس/الحقل | ثابتان أعلى اللوحة | ثابتان ✓ |
| تمرير الصفحة خلف البحث | `body`+`html` = hidden · `pageScrollY` = 0 | **كما هو** ✓ |
| مدى التمرير (نتيجتان) | 0 | 0 |
| لوحة مفاتيح (390×420 محاكاة) | — | رأس 138px · جسم 282px · **زر الإغلاق مرئي** · الحقل مركّز · آخر نتيجة **قابلة للوصول** (تمرير) ✓ · بلا JS hacks وبلا dvh |

## 12) Dark mode

| عنصر | قيمة | تباين |
|---|---|---|
| سطح اللوحة | `#121b2b` (`--store-surface`) | — |
| الحقل | bg `#0f1826` · حدّ = أزرق المتجر مُفتَّحاً (مزج توكنات) · نص `#f1f5f9` | 16.26:1 |
| اسم النتيجة | `#f1f5f9` على `#121b2b` | **15.75:1** |
| الميتا/العنوان | `#94a3b8` | **6.73:1** |
| السعر | `#f1f5f9` | **15.75:1** |
| الصف: حدّ | `#1e2a3d` (`--store-border`) | — |
| CTA الحالة | `--store-primary` + `--text-on-brand` | 6.09:1 |
| ✕/أيقونات | `--store-text` على `--store-surface-soft` | 16.26:1 |
| HEX خاص بالداكن | **لا جديد** (كل شيء توكنات) | — |

## 13) 360 / 430 / 600 / 768

| مقاس | الحقل | الصف قبل→بعد | الصورة قبل→بعد | الرأس | العنوان | فائض |
|---|---|---|---|---|---|---|
| 360x780 | 284×48 | 87 → 92 | 56 → 68 | 73 | 13px | 0 |
| 430x900 | 354×48 | 74 → 90 | 56 → 68 | 73 | 13px | 0 |
| 600x900 | 524×48 | 74 → 90 | 56 → 68 | 73 | 13px | 0 |
| 768x1000 | 684×48 | 74 → 90 | 56 → 68 | 73 | 13px | 0 |

## 14) Desktop regression (1024 / 1366)

| مقاس | اللوحة | زر البحث | نموذج البحث | الهيدر | فائض |
|---|---|---|---|---|---|
| 1024 | hidden ✓ | `display:none` ✓ | `display:none` | 74px | 0 |
| 1366 | hidden ✓ | `display:none` ✓ | `display:flex` (كما هو) | 74px | 0 |

كل قواعد 2E داخل `≤1023px` ⇒ **لا تسرّب للديسكتوب** ✓

## 15) Search functional regression (كله أخضر)

| السلوك | النتيجة |
|---|---|
| فتح + Autofocus | الحقل مركّز ✓ (`shop-search-sheet-input`) |
| debounce | **681ms → 681ms** (كتابة 5 أحرف ×60ms + 300ms debounce) — **لم يتغير** |
| Suggestions | 5 شرائح من بيانات حقيقية ✓ |
| Loading | 3 هياكل + `aria-busy` بلا live ✓ |
| Results | «نتائج (2)» + صفّان بمسارات المنتجات ✓ |
| Empty | «لا نتائج مطابقة» + CTA ✓ |
| Clear | 44×44 · يُفرّغ · يعيد الشرائح · يعيد التركيز ✓ |
| Escape | يُغلق ✓ · يعيد التركيز إلى زر البحث ✓ · يحرّر التمرير ✓ |
| Close | يُغلق ✓ |
| Resize ≥1024 أثناء الفتح | يُغلق ✓ (والتمرير يُحرَّر) |
| فتح منتج | نفس `href` ونفس السلوك (لا route جديد) ✓ |

## 16) Accessibility / live regions

- `role=status` + `aria-live=polite` + `aria-atomic=true`: محفوظة في **عدّاد النتائج** وفي **حالتي الفراغ والخطأ** ✓ · **لا aria-live على قائمة النتائج كاملة** ✓ · **التحميل بلا live** ✓
- `aria-labels` محفوظة (إغلاق/مسح/الحقل) · سلوك الكيبورد · Escape · إعادة التركيز ✓
- أهداف اللمس: إغلاق 44 · مسح 44 · شريحة 44 · صف 90 ✓ · خط الحقل 16px ✓
- Focus visible: حلقة **`--store-shadow-focus`** + outline النظام ✓ (لم يُحذف أي outline)
- تباين (فاتح/داكن): الاسم 17.85/15.75 · الميتا 4.76/6.73 · السعر 17.85/15.75 · العنوان 4.76/6.73 · نص الحقل 17.06/16.26 · ✕ 17.06/16.26 — **كلها ≥ AA** ✓

## 17) Header regression
الارتفاع **65px** · الشعار 34px · اللوحة `top` = 65 ✓ (لم يُلمس `shop.header.css`).

## 18) Menu regression
فتح ✓ · `drawerTop 65 = headerBottom 65` · صفوف 50px ✓ (لم يُلمس 2D/2D.1).

## 19) Cart regression
`#shop-cart-button` → `#/cart` · 44×44 ✓

## 20) Home regression
5 بطاقات منتجات + Hero ✓ (لم يُلمس `shop.home.css`)

## 21) Horizontal overflow
`documentElement` = 0 · اللوحة = 0 · الجسم = 0 — على كل المقاسات (360 تحديداً) ✓

## 22) Console errors
**0** في كل الحالات (فتح/كتابة/تحميل/نتائج/فراغ/خطأ/مسح/إغلاق/داكن/مقاسات).

## 23) `!important`
**0 جديدة** — `shop.search.css` = **0** أصلاً · `shop.header.css` = 15 (كما بعد 2D).

---

## 24) اللقطات

قبل: `before-390-initial/results/empty/loading/error/dark-results/focus.png`
بعد: `after-390-initial.png` (B) · `after-390-results.png` (C) · `after-390-results-scrolled.png` (D) · `after-390-empty.png` (E) · `after-390-loading.png` (F) · `after-360x780-results.png` (G) · `after-600x900-results.png` (H) · `after-390-dark-results.png` (I) · `after-390-focus.png` (J) · `after-1366-desktop.png` (K) · `after-390x420-keyboard.png`
قياس: `search-before.json` · `search-after.json` · `extra-after.json` (سعة/تباين/شاشة قصيرة) · `cssom-after.json`

## 25) خارج Scope (بلا تعديل — للعلم)

1. **البيانات الحقيقية محدودة:** المتجر فيه **منتجان فقط** وكلاهما **بلا صور** (`primaryImage: null`) ⇒ لا يمكن عرض «4+ نتائج» ولا صورة منتج حقيقية في لقطة؛ تحقّق `object-fit: contain` تمّ بـ(CSSOM + صورة اختبار داخل صف حقيقي: 10×20 → 68×20 بلا قص).
2. **حلقة التركيز:** استخدمت توكن النظام المخصّص للمتجر `--store-shadow-focus` بدل الحلقة العامة `--shadow-focus` (teal) لتناسق الحقل الأزرق — البند 8 («focus ring من النظام» + «لا teal»). الإرجاع = سطر واحد.
3. **السعر القديم/الخصم:** الـmodel يوفّر `compareAtPrice/hasDiscount` لكن **صف البحث لا يعرضهما أصلاً** ⇒ لم أُضف محتوى أو حساباً (البند 21: «لا تضف حساب خصم جديد»). جاهز للإضافة إن أردت لاحقاً.
4. **✕ الأصلي للمتصفح** كان ظاهراً داخل الحقل (مسحان لنفس الوظيفة) — أُصلح بـCSS (`::-webkit-search-cancel-button`)، وهو سلوك WebKit/Blink فقط.
5. **لا `dvh`** — البنية (`top/bottom` على عنصر fixed) تعمل مع الشاشة القصيرة (مُختبر 390×420) بلا JS hacks.

**لم أبدأ Desktop Header ولا Phase 3 — بانتظار الموافقة.**

## 26) الإرجاع

```bash
# إرجاع 2E = حذف قسم «PHASE 2 · STEP 2E» + @keyframes shop-search-pulse من shop.search.css
```
