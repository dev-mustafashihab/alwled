# PHASE 2 · STEP 2F — DESKTOP HEADER & NAVIGATION POLISH
**تقرير تنفيذ وقياس — هيدر سطح المكتب في متجر alwled (≥1024px)**
التاريخ: 2026-09-18 · الموديل: deepseek/deepseek-v4.1-flash

---

## 0) الخلاصة

هيدر الديسكتوب صار بهوية المتجر الزرقاء: التنقل النشط أزرق هادئ بدل teal، البحث صار **ظاهراً على 1024** (كان `display:none` تماماً!) بارتفاع 44 وخط 16 ويملأ الوسط بلا فراغ، أهداف اللمس كلها ≥44، سطح صريح بلا blur وتدرّج مع ظل خفيف عند التمرير فقط، وتركيز واحد واضح بلا teal وبلا ازدواج.

| | قبل | بعد |
|---|---|---|
| حقل البحث على **1024** | **مخفي (0px)** | **221px** (input 162×44 · font 16) |
| فراغ بين التنقل والبحث على 1366 | 171px | **28px** |
| Spacer (الفراغ الحر) | 151–245px | **8px** |
| ارتفاع رابط التنقل | 37.6px | **44px** |
| أزرار الزائر (دخول/تسجيل) | 32px | **44px** |
| التنقل النشط | teal-50 + teal-700 + 700 | **primary-soft + أزرق المتجر + 600** |
| التركيز | outline teal + ring teal (مزدوج) | **outline واحد أزرق المتجر** |

**ملف واحد:** `shop/assets/css/shop.header.css` (القسم 18، داخل `min-width:1024px`) · **صفر JS · صفر DOM · صفر `!important` جديد** · Console 0 · الجوال لم يتغيّر.

---

## 1) الملفات المعدّلة

| ملف | التعديل |
|---|---|
| `shop/assets/css/shop.header.css` | **القسم 18 (جديد)** — كل قواعده داخل `@media (min-width: 1024px)` · ونُقل إلى آخر الملف ليأتي بعد 16/17 |
| `tools/qa/stage2f/*` | أدوات قياس + لقطات (غير تابعة للتطبيق) |

**لم يُلمس:** أي JS · `index.html` · `shop.css` · `shop.search.css` · `shop.home.css` · `tokens.css` · أي helper.
إثبات النطاق: `find frontend -newermt "2026-09-18 15:30" -not -path "*/tools/*"` ⇒ ملف واحد.

---

## 2) Desktop DOM الفعلي (RTL — كما هو، بلا تغيير)

```
.shop-header (sticky · 74px · زد-ستيكي)
└─ .shop-header__inner  (flex · max-width 1200px · padding-inline 24 · gap 10 · height 73)
   ├─ a.shop-brand  [ img.shop-brand__logo 36×36 teal(asset) + strong «الوليد» 16px + small «للأجهزة الكهربائية» ]
   ├─ span.shop-header__divider  (1×24px)
   ├─ nav.shop-nav (4 روابط: الرئيسية · المنتجات · التصنيفات · العلامات — data-nav + aria-current من shop.app.js)
   ├─ span.shop-header__spacer   (flex — كان يتمدد)
   ├─ form.shop-search (role=search) [ input.shop-search__input (placeholder «ابحث عن منتج…») + button.shop-search__btn «بحث» ]
   ├─ button.shop-searchbtn  (جوال فقط — display:none على الديسكتوب)
   ├─ div.shop-actions
   │    زائر:  a.shop-cartbtn(#/cart) + a.btn--ghost(#/login) + a.btn--primary(#/register)
   │    مسجّل: a.shop-bell(#/notifications) + a.shop-cartbtn(#/cart) + button#shop-user-btn (aria-haspopup=menu)
   └─ button#shop-burger (display:none على الديسكتوب)
```
ترتيب RTL البصري: **الشعار (يمين) → الفاصل → التنقل → البحث (وسط) → الأدوات (يسار)**.

---

## 3) المشاكل التي وجدتها قبل التعديل (وثّقتها أولاً)

1. ** حرجة — لا بحث على 1024 بالضبط:** `shop.css` فيه `@media (max-width: 1024px) { .shop-nav, .shop-search { display: none } }` بينما `shop.header.css` يعيد التنقل فقط (`min-width:1024`) ولا يعيد حقل البحث ⇒ على العرض **1024** الحقل `display:none` وبعرض 0 (لا حقل ولا زر بحث هناك). مُثبَت قياساً + بصرياً.
2. **teal كـUI accent:** التنقل النشط (`--brand-50` + `--brand-700` + وزن 700)، تركيز التنقل (`outline 2px teal` من `.shop-body :focus-visible` + حلقة teal 3px من base = **مزدوج**)، تركيز حقل البحث (حدّ `#14b8a6` + حلقة teal)، زر «إنشاء حساب» (teal صريح)، أيقونة السلة (teal-700).
3. **أهداف لمس دون 44:** روابط التنقل 37.6px · أزرار الزائر 32px · زر «بحث» 32px · حقل البحث 40px.
4. **خط حقل البحث 13px** (المطلوب ≥16 لحقل قابل للتحرير مباشرة) وحشوته 12px.
5. **فراغ داخلي كبير:** المسطرة كانت تتمدد (spacer 151–245px) ⇒ فجوة 171px بين التنقل والبحث على 1366+.
6. **سطح زجاجي:** `rgba(255,255,255,.9)` + `backdrop blur 16px` + **ظل ثابت** `0 4px 20px` في كل الحالات (لا فرق بين أعلى الصفحة والتمرير).
7. فاصل الهيدر موجود (1×24) ✓ — أبقيته بتوكن المتجر.

---

## 4) Header قبل/بعد

| | قبل | بعد |
|---|---|---|
| الارتفاع | 74px | **74px** (بلا تغيير — داخل الهدف 72–74) |
| Inner | max-width 1200 · padding-inline 24 · gap 10 | كما هو |
| الخلفية | `rgba(255,255,255,.9)` + blur 16px | **`--store-surface`** صريحة · **بلا blur** |
| الحدّ | `--border-subtle` | **`--store-border`** |
| الظل | `0 4px 20px rgba(15,23,42,.06)` دائماً | **`none` أعلى الصفحة · `--shadow-sm` عند التمرير** |
| الوضع | sticky ✓ | sticky ✓ (بلا fixed) |

## 5) Logo قبل/بعد

لا تغيير في الـasset/النص/المسار/الحجم: **36×36** · هدف **126×44** (≥44 ✓) · النص 16px/700 + سطر فرعي 11.5px. فقط ألوان النص صارت توكنات متجر (`--store-text` / `--store-text-muted`). الشعار يبقى **teal (asset)** كما هو مطلوب، ولا يُستخدم لوناً للواجهة.

## 6) Navigation قبل/بعد

| | قبل | بعد |
|---|---|---|
| ارتفاع الرابط | 37.59px | **44px** (`min-height` + inline-flex) |
| الخط | 13.5px | **14px** |
| حشوة أفقية / فراغ | 12px / 2px | **10px / 4px** |
| اللون | `--text-muted` | **`--store-text-body`** (تباين 6.09) |
| عرض التنقل | 306px | 292px (أرشق ⇒ مساحة للبحث) |
| الروابط | 4 (بلا تغيير) | 4 — لا إضافة/حذف/تغيير نص أو مسار ✓ |

## 7) Active / Hover / Focus

| الحالة | قبل | بعد |
|---|---|---|
| Active (`aria-current=page`) | teal-50 bg · teal-700 · **700** | **`--store-primary-soft`** bg · **`--store-primary`** · **600** · تباين 5.36 (فاتح) / 6.82 (داكن) |
| Hover | `--bg-surface-2` + `--text-strong` (بلا تغيير في القياس 72×44) | **`--store-surface-soft`** + `--store-text` · **بلا أي إزاحة layout** ✓ |
| Focus | outline 2px teal **+** ring teal 3px (مزدوج) | **outline واحد 2px `--store-primary`** (offset 2) · بلا ring · تباين 6.09/7.91 |

## 8) Search قبل/بعد

| | قبل | بعد |
|---|---|---|
| الظهور على 1024 | **`display:none`** | **`flex`** ✓ |
| العرض | 260px ثابت / **0 على 1024** | **مرن**: 221 (1024) · 297 (1100) · **397** (1280+) — `flex:1 1 220px; max-width:420px` |
| الارتفاع | 40px | **44px** |
| الخط | 13px | **16px** |
| السطح/الحدّ | أبيض + `#dde5ee` | **`--store-surface-soft` + `--store-border`** |
| الحدّ عند التركيز | **teal** `#14b8a6` | **`--store-primary`** |
| Placeholder | افتراضي | **`--store-text-muted`** · لا ينقص: النص 101px داخل 136px (1024) و312px (1366) ✓ |
| زر «بحث» | 46×32 · teal | **59×44 · `--store-primary`** |
| ✕ المتصفح | ظاهر (مزدوج) | **مُخفى** |
| المنطق/debounce/المسارات | — | **بلا تغيير** ✓ |

## 9) Cart قبل/بعد

| | قبل | بعد |
|---|---|---|
| المقاس | 46×46 ✓ | 46×46 ✓ |
| السطح/اللون | `--bg-surface-2` + **teal-700** + حدّ | **`--store-surface-soft` + `--store-text` + حدّ شفاف** · hover/focus: primary-soft + أزرق المتجر |
| الأيقونة | 21px | 21px ✓ · الشارة/المنطق/المسار `#/cart` بلا تغيير ✓ |

**فحص الشارة (1 / 12 / 99+) بحقن محلي في سياق الفحص فقط:** عرض الشارة 20 / 26 / 32px و**`inner.scrollWidth - clientWidth = 0`** و**فائض الصفحة = 0** في كل الحالات (قبل وبعد) ⇒ **لا انزياح layout** ✓

## 10) Guest state (1024/1366) — قبل/بعد

| | قبل | بعد |
|---|---|---|
| أزرار الزائر | دخول 87×**32** · تسجيل 97×**32** · teal | دخول 100×**44** (نصّي هادئ `--store-text-muted`) · تسجيل 104×**44** (**`--store-primary`**) |
| فراغ spacer | 245 (1024) / 151 (1366) | **8 / 8** |
| المسافة تنقل→بحث | — / 171 | **28 / 28** |
| فائض | 0 | 0 |

## 11) Auth state (1024/1366)

| | قبل | بعد |
|---|---|---|
| الأدوات | جرس 46 · سلة 46 · حساب 46 (bg أبيض + حدّ) | جرس 46 · سلة 46 · حساب 46 — **`--store-surface-soft` + حدّ شفاف** ✓ |
| البحث | 260 / 260 | **333 / 420** (يستفيد من المساحة) |
| `aria-label`/`title` | «قائمة الحساب — …» / «حسابي» | بلا تغيير ✓ · الاسم الطويل في `title`/`aria` فقط ⇒ لا كسر في الهيدر ✓ |
| فائض | 0 | 0 |

## 12) 1024 — النتيجة (أهم شاشة)

| | قبل | بعد |
|---|---|---|
| حقل البحث | **غائب** | **موجود** 221px (input 162×44) |
| التنقل | 4 روابط 37.6px | 4 روابط **44px** · عرض 292 |
| الأدوات | 46 · 32 · 32 | 46 · **44 · 44** |
| Spacer | 245 | **8** |
| فائض أفقي | 0 | **0** · بلا التفاف وبلا تراكب ✓ |

## 13) 1366 — النتيجة
Inner 1200 · بحث **397** (input 338×44) · تنقل 292 (44px) · أدوات 270 (46/44/44) · **تنقل→بحث 28** · فائض 0 ✓

## 14) 1440 / 1920
Inner مثبّت على **1200** (بلا تغيير) ⇒ نفس تكوين 1366 تماماً (بحث 397 · تنقل→بحث 28) — **لا فراغات غريبة** على الشاشات الواسعة ✓

## 15) Sticky
| scrollY | 0 | 200 | 600 | 900 | 1500 | 2413 (النهاية) |
|---|---|---|---|---|---|---|
| headerTop | 0 | 0 | 0 | 0 | 0 | 0 |
| height | 74 | 74 | 74 | 74 | 74 | 74 |
| is-scrolled | false | true | true | true | true | true |

بلا fixed · بلا تقلّص · إصلاح 2B سليم ✓

## 16) Scrolled state
أعلى الصفحة: `box-shadow: none` + حدّ `--store-border` · عند التمرير: **`--shadow-sm`** (توكن النظام) — بلا تغيّر في الارتفاع أو الحركة ✓

## 17) Dark mode
| عنصر | قيمة | تباين |
|---|---|---|
| سطح الهيدر | `#121b2b` (`--store-surface`) · حدّ `#1e2a3d` | — |
| أعلى الصفحة / التمرير | بلا ظل / **`--shadow-sm` داكن** | — |
| التنقل الافتراضي | `#cbd5e1` | **11.62** |
| التنقل النشط | accent مُفتَّح (مزج توكنات) على primary-soft مُركّبة | **6.82** (كان teal-50 على سطح داكن) |
| حقل البحث | bg `#0f1826` · حدّ `#1e2a3d` · نص `#f1f5f9` | 16.26 |
| Placeholder | `#94a3b8` | 6.95 |
| السلة/الجرس/الحساب | `#0f1826` + `#f1f5f9` | 16.26 |
| «إنشاء حساب» | `--store-primary` + أبيض | 6.09 |
| التركيز | outline بلون الإبراز | 7.91 |
| HEX خاص بالداكن | **لا جديد** (توكنات + color-mix) | — |

## 18) RTL
كل الخصائص منطقية (`padding-inline`, `margin-inline`, `inset-inline`) · لا `left/right` جديد · الترتيب البصري صحيح: شعار يمين → تنقل → بحث → أدوات يسار · الأيقونة قبل النص · موضع شارة السلة كما هو ✓

## 19) Accessibility
- **كل الأهداف ≥44:** تنقل 44 · سلة 46 · جرس 46 · حساب 46 · دخول/تسجيل 44 · زر بحث 44 · حقل 44 ✓
- تركيز مرئي **واحد** وواضح (بلا ازدواج · بلا teal) ✓ · Tab order منطقي (DOM كما هو) ✓
- `aria-label` للسلة/الجرس/الحساب · `aria-haspopup=menu` للحساب · `aria-current=page` للتنقل النشط (من `shop.app.js` — بلا تغيير) ✓ · ليبل بحث (`label.visually-hidden` + `aria-label`) موجود ✓
- تباين (فاتح/داكن): تنقل 6.09/11.62 · نشط 5.36/6.82 · نص الحقل 17.06/16.26 · placeholder 4.55/6.95 · زر بحث 6.09/6.09 · سلة 17.06/16.26 · تسجيل 6.09/6.09 · دخول 4.76/6.73 — **كلها ≥ AA** ✓

## 20) Horizontal overflow
`scrollWidth == clientWidth` على **1024 · 1100 · 1280 · 1366 · 1440 · 1920** (guest و auth) وعلى **كل الصفحات** ✓ · بلا التفاف تنقل/بحث/شعار/أدوات ✓

## 21) Mobile regression (≤1023)
| | 2C/2D/2E | بعد 2F |
|---|---|---|
| ارتفاع الهيدر | 65 | **65** ✓ |
| الشعار / هدف الشعار | 34 / 77×44 | **34 / 77×44** ✓ |
|  · 🔍 · 🛒 | 44×44 | **44×44** ✓ |
| فراغ الأدوات | 6px | **6px** ✓ |
| nav/search form | `display:none` | **`display:none`** ✓ |
| فائض | 0 | **0** ✓ |

## 22) Menu regression
فتح القائمة ✓ · `drawerTop 65 = headerBottom 65` · صفوف 50px · مبدّل المظهر 54px ✓ (بلا تغيير)

## 23) Search 2E regression
`sheetTop 65 = headerBottom 65` · صف النتيجة 90px · الحقل 48px · زر المسح 44px · سطح اللوحة أبيض ✓ — **كل قيم 2E كما هي** · `shop.search.css` **لم يُلمس** ✓

## 24) Console errors
**0** في كل الحالات (مقاسات/حالات/صفحات/داكن/تفاعلات).

## 25) `!important` الجديدة
**0** — `shop.header.css` = 15 (كما بعد 2D) · `shop.search.css` = 0 · بلا أي إضافة.

## 26) Selectors المتغيّرة (القسم 18 — كلها داخل `@media (min-width: 1024px)`)
```
.shop-body { --shop-desktop-accent: var(--store-primary); }
[data-theme='dark'] .shop-body
.shop-body .shop-header
.shop-body .shop-header.is-scrolled
.shop-header .shop-search
.shop-header .shop-header__spacer
.shop-header .shop-nav
.shop-header .shop-nav__link
.shop-header .shop-nav__link:hover
.shop-header .shop-nav__link[aria-current='page']
.shop-header .shop-search__input  (+ ::placeholder · :focus · ::-webkit-search-cancel-button/-decoration)
.shop-header .shop-search__btn  (+ :hover)
.shop-header .shop-cartbtn / .shop-bell / .shop-user  (+ :hover/:focus-visible)
.shop-header .shop-actions > a[href='#/login'] / a[href='#/register']  (+ :hover/:focus-visible)
.shop-header .shop-header__divider
.shop-header .shop-brand__text strong / small
.shop-header :focus-visible
```
لم أُضف `!important` ولا دخلت حرب specificity (استخدمت `.shop-header <descendant>` بدرجة أعلى بنقطة واحدة فقط).

## 27) اللقطات
- `after-auth-1024-top.png`
- `after-auth-1366-top.png`
- `after-dark-1366-top.png`
- `after-guest-1024-scrolled.png`
- `after-guest-1024-top.png`
- `after-guest-1366-focus.png`
- `after-guest-1366-scrolled.png`
- `after-guest-1366-top.png`
- `after-guest-1440-scrolled.png`
- `after-guest-1440-top.png`
- `after-mobile-390-header.png`
- `after-mobile-390-menu.png`
- `after-mobile-390-search.png`
- `before-auth-1024-top.png`
- `before-auth-1366-top.png`
- `before-dark-1366-top.png`
- `before-guest-1024-scrolled.png`
- `before-guest-1024-top.png`
- `before-guest-1366-focus.png`
- `before-guest-1366-scrolled.png`
- `before-guest-1366-top.png`
- `before-guest-1440-scrolled.png`
- `before-guest-1440-top.png`
- `before-mobile-390-header.png`
- `before-mobile-390-menu.png`
- `before-mobile-390-search.png`

## 28) خارج Scope (بلا تعديل)
1. **`shop.css` فيه `@media (max-width: 1024px)` يُخفي `.shop-nav` و`.shop-search`** — أصلحتُ أثره على 1024 **من `shop.header.css` فقط** (كما طلبت في نطاق الملفات) ولم أُنظّف breakpoints (خارج النطاق). يُستحسن لاحقاً توحيدها إلى `max-width: 1023px`.
2. **الشعار teal (asset)** — بقي كما هو (البند 6) ويظهر teal أيضاً في الثيم الداكن؛ في الواجهة لا يوجد teal الآن.
3. **زر «حسابي» (auth) أيقونة فقط** بـ`title="حسابي"` — لم أُضف نصاً (لا اختراع محتوى)؛ الاسم الطويل يبقى في `aria/title` ⇒ لا كسر.
4. **شارة السلة** اختُبرت بحقن محلي (1/12/99+) لأن بيانات السلة الحقيقية فارغة؛ أُثبت عدم الانزياح ثم أُزيل العنصر.
5. **صفحة Home** فيها فراغ أفقي كبير على الديسكتوب (عمود المحتوى في اليمين) — **خارج نطاق الهيدر** ولم أُلمسها (Phase 1 مقفلة).

**لم أبدأ Phase 3 ولا Token cleanup ولا JS refactor — بانتظار الموافقة.**
