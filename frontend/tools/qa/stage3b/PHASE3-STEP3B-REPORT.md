# PHASE 3 — STEP 3B · LISTING FOUNDATION & DESKTOP PARITY

**النوع:** تنفيذ (Presentation/Structure فقط) · **التاريخ:** 2026-09-18
**المتجر:** https://panel.fahd-car.cloud/alwled/shop/ · **أدوات القياس:** `frontend/tools/qa/stage3b/` (`probe.py before|after` · `journey_only.py` · `compare.py`)
**JSON الخام:** `probe-before.json` · `probe-after.json` · `journey-before.json` · `journey-after.json`
**نسخ احتياطية للإرجاع:** `backup-shop.css` · `backup-shop.filters.css` · `backup-shop.pages.js` + `backup-md5-before.txt`

---

## 1) FILES MODIFIED — 2 ملفات، 3 تغييرات

| الملف | md5 قبل → بعد | التغيير |
|---|---|---|
| `frontend/shop/assets/css/shop.filters.css` | `42de7b53…` → `51a53a40…` | +21 سطرًا داخل كتلة `@media (min-width:769px)` الموجودة + كتلة جديدة `769–1023` |
| `frontend/shop/assets/css/shop.css` | `0c75085a…` → `8d544511…` | سطر واحد: `@media (max-width: 640px)` → `@media (max-width: 768px)` (كتلة آلية فلاتر الجوال) |
| `frontend/shop/assets/js/shop.pages.js` | `a930c5d4…` → **`a930c5d4…` (بلا تغيير)** | **JS = 0 تغييرات** |
| بقية الملفات (shop.js · shop.cart* · shop.home.css · shop.header.css · shop.search.css · tokens.css · backend/src) | — | **لم تُلمس** |

`find shop assets -newermt "2026-09-18 16:45"` ⇒ ملفان فقط ✓ · diff كامل في §31.

---

## 2) ROOT CAUSE — مؤكَّد بالقياس (وسبب ثانٍ كان مخفيًا)

1. **السبب الأساسي:** `renderProducts` يضيف الشريط داخل `.shop-filters__sheet` (`shop.pages.js:552-563`)، و`shop.filters.css` يعرّف `.shop-filters__sheet { display: none }` ويُظهره فقط داخل `@media (max-width: 768px)` ⇒ **عند ≥769 الشريط داخله = صندوق لا يُنتج ⇒ صفر عناصر تحكم**.
2. **سبب ثانٍ لم يُوثَّق في 3A:** زر «الفلاتر والترتيب» يُظهر بـ`display:flex` **فقط داخل `@media (max-width:640px)`** (shop.css:2340) بينما اللوحة تُعرَّف حتى **768** ⇒ **في 641–768 اللوحة كانت موجودة خارج الشاشة (`translateY(102%)`) بلا أي زر لفتحها**.
   **إثبات (قبل):** 641/700/768 ⇒ `toggle=False` + `sheet=block` + اللوحة في `top ≈ 857` (تحت الشاشة) + 8 عناصر تحكم «موجودة لكن غير قابلة للوصول».
3. **إثبات قبل (رحلة الديسكتوب):** على **1024 و1366** كل خطوات التفاعل الثمانية فشلت بـ`Timeout: element is not visible` (search/category/brand/sort/price/instock/offers) و«تفريغ الفلاتر» بلا أثر ⇒ **لا يمكن استخدام أي أداة تصفية**.

---

## 3) DOM BEFORE / AFTER — **لا تغيير في DOM**

```
#shop-view
├─ section head
├─ .shop-filters            (display: contents)
│   ├─ #shop-filters-toggle (جوال فقط)
│   ├─ .shop-filters__scrim (جوال فقط)
│   └─ .shop-filters__sheet
│       ├─ __sheet-head
│       ├─ #shop-toolbar ─ ▶ (نفس العقدة، لا نسخة ثانية)
│       └─ __sheet-foot
─ .shop-grid
```
- **قبل:** عند ≥769 `.shop-filters__sheet { display:none }` ⇒ الشريط مُستبعد من العرض.
- **بعد:** عند ≥769 `.shop-filters__sheet { display: contents }` ⇒ اللوحة **لا تُنتج صندوقًا** وتصعد `#shop-toolbar` إلى مسار `#shop-view` **بين رأس القسم والشبكة** — نفس العناصر ونفس الـIDs ونفس المستمعات.
- عند ≤768 **لا شيء تغيّر** في السلوك: اللوحة `block + fixed + translateY(102%)` كما كانت.

---

## 4) WHY THIS ARCHITECTURE — أقل حل DOM تعقيدًا

- المطلوب: «مصدر منطقي واحد للشريط مع عرض مختلف» + **منع duplicate IDs/state sync**.
- البديل الأول (نقل العقدة في JS عند الـbreakpoint) = كود JS + خطر إعادة ربط مستمعات/حالة ⇒ مرفوض (requirement 28).
- البديل الثاني (نسختان من الحقول) = duplicate IDs ⇒ **ممنوع صريحًا** (requirement 27).
- **المختار:** `display: contents` على اللوحة عند ≥769 = **0 تغيير DOM · 0 تغيير JS · 0 duplicate IDs**، ويحقق «نفس عناصر التحكم تُعرض حسب الـlayout» حرفيًا. (أُضيف في CSS فقط، ويُرجَع بسطر واحد.)

---

## 5) MOBILE LAYOUT (≤768) — كما كان، وأُغلقت الفجوة

| العرض | Toggle | Sheet | ارتفاع اللوحة | عناصر ظاهرة (مغلقة) | Head/Foot |
|---|---|---|---|---|---|
| 360 / 390 / 430 / 600 / 640 | ✅ 44px | block (off-screen) | 132 داخل اللوحة | 1 (البحث فقط) | ✅ |
| **641 / 700 / 768** | ✅ **جديد** (كان ❌) | block | 132 | 1 | ✅ |
- **فتح اللوحة عند 768:** قبل = `clicked=False` (لا زر) · بعد = `clicked=True` + اللوحة `h=692.08` و`top=151.92` — **مطابق لسلوك 390 تمامًا** ✓
- عند الفتح: **8 عناصر تحكم** + رأس/قدم + «عرض النتائج» + «تفريغ الفلاتر» ✓ بلا أي تغيير في تصميم اللوحة.

---

## 6) 769–1023 LAYOUT (المنطقة التي كانت مكسورة)

- الشريط **inline** بعرض الحاوية · `grid-template-columns: repeat(3, minmax(0,1fr))` ⇒ **3 صفوف**:
  1) بحث | تصنيف | علامة  2) ترتيب | السعر | التوفّر  3) العروض | العدّاد
- القياس: 769/800/900/1023 ⇒ **ارتفاع 262px**، **8/8 عناصر ظاهرة**، العدّاد ظاهر، عرض كل حقل 226px عند 769، فائض 0.
- تحقق بصري على 769 ✓ (3 صفوف مرتّبة، بلا مشل/قصّ، RTL صحيح).

## 7) 1024 LAYOUT

- `grid-template-columns: minmax(0,1.8fr) repeat(3, minmax(0,1fr))` ⇒ **صفّان**:
  1) **بحث (346px)** | تصنيف (192) | علامة (192) | ترتيب (192)
  2) **السعر (346، حقلا «من/إلى»)** | التوفّر (192) | العروض (192) | العدّاد (192)
- **ارتفاع 262 → 182px** · **8/8** · العدّاد `2 منتج` ظاهر عند `x=189` ✓ · فائض 0 ✓ · لا قصّ نصوص (أصغر عمود 192px).

## 8) 1366+ LAYOUT (1280 · 1366 · 1440 · 1920)

- نفس الصفّين: بحث **412** | 229 | 229 | 229 · السعر 412 | التوفّر | العروض | العدّاد ⇒ **لا يبتلع البحث العرض** ولا حشوة ميتة (الحاوية مقيّدة 1200 كما هي).

## 9) TOOLBAR MEASUREMENTS (بعد)

| العرض | مرئي | الارتفاع | الصفوف | أعمدة | شبكة (top) | صفحة (h) | فائض |
|---|---|---|---|---|---|---|---|
| 768 | في اللوحة | 132 | 2 | 1fr | 257.2 | 1123 | 0 |
| 769 | **نعم** | **262** | **3** | 226×3 | 483.2 | 1349 | 0 |
| 1024 | نعم | **182** | **2** | 345.7+192×3 | 412.2 | 1298 | 0 |
| 1366 | نعم | 182 | 2 | 411.7+228.75×3 | 412.2 | 1258 | 0 |
| 1920 | نعم | 182 | 2 | 411.7+228.75×3 | 412.2 | 1258 | 0 |

## 10) RESULT COUNT

- `.shop-toolbar__count` ⇒ **مرئي على كل العروض ≥769** (كان مخفيًا كليًا): `2 منتج` · مقاس 36×21.6 · `justify-self: start` (يبدأ من بداية RTL = يمين خلية العدّاد) ✓
- النص/الـcopy لم يُغيَّر · **لم يُضف aria-live** (3G) ✓ · على الجوال: السلوك كما كان (داخل اللوحة) ✓

## 11) CONTROL SIZES (بعد)

| العنصر | 769 | 1024 | 1366 |
|---|---|---|---|
| بحث (#shop-filter-search) | **44** | 44 | 44 |
| تصنيف / علامة / ترتيب (select) | 44 | 44 | 44 |
| min/max price | 44 | 44 | 44 |
| `input[type=checkbox]` | 18×18 | 18×18 | 18×18 |
| **label `.shop-check` (المنطقة القابلة للنقر)** | **192×44 (min-height:44px)** | 192×44 | 229×44 |
⇒ كل عناصر التحكم التفاعلية ≥44px ✓ (الـcheckbox نفسه 18×18 داخل label بارتفاع 44 — لم يُغيَّر عالميًا كما طُلب).

## 12) DUPLICATE-ID TEST

| المعرّف | 390 | 768 | 1024 | 1366 | قبل (1024) |
|---|---|---|---|---|---|
| #shop-filter-search · category · brand · sort · minprice · maxprice · instock · offers · #shop-toolbar · #shop-filters-toggle | 1 | 1 | 1 | 1 | 1 |

**كل المعرّفات = 1 بالضبط** ✓ (لا نسخة ثانية لأن الشريط عقدة واحدة).

## 13) EVENT-BINDING TEST (بعد — 1024 و1366)

| الخطوة | تغيّر hash | الطلبات لكل تفاعل | بطاقات | عدّاد |
|---|---|---|---|---|
| search «ثلاجة» | ✅ | `products…search=ثلاجة` + categories + brands | 2 | 2 منتج |
| category=293 | ✅ | + `categoryId=293` | 2 | 2 |
| brand=254 | ✅ | + `brandId=254` | 1 | 1 |
| sort=price:asc | ✅ | + `sortBy/sortOrder` | 1 | 1 |
| minPrice=400 | ✅ | (نفس URL — سلوك 3C) | 1 | 1 |
| inStock | ✅ | (نفس URL — سلوك 3C) | 1 | 1 |
| offers | ✅ | (نفس URL) | **0** (فلترة محلية قائمة) | 0 |
| reset (زر الرأس) | ✅ | `products?page=1&limit=12` | 2 | 2 |
⇒ **طلب `products` واحد فقط لكل تفاعل** — لا مضاعفة، لا تنقّل مزدوج، لا تطبيق مرتين ✓
**قبل (مُعاد بقياس نظيف):** كل الخطوات الثماني على 1024 و1366 = `Timeout: element is not visible` و reset بلا أثر ✓

## 14–17) SEARCH · CATEGORY · BRAND · SORT — DESKTOP

- الأربعة مرئية وقابلة للاستخدام على 769/1024/1366 ✓ · نفس المنطق (hash + API) بلا أي تغيير ✓
- **Search داخل القائمة ≠ بحث الهيدر**: لم يُلمس `shop.search.js` ولا الهيدر ✓

## 18–20) PRICE · IN-STOCK · OFFERS — PRESENTATION ONLY

- الحقول الثلاثة **ظاهرة** على الديسكتوب (44px) وتُطلق **نفس** أحداثها القائمة (تغيّر hash + طلب واحد) ✓
- **لم تُصلَح دلالتها** كما طُلب: السعر لا يُرسَل للـAPI ولا يُفلتر محليًا · `inStock` بلا أثر · `offers` فلترة محلية على الصفحة الحالية ⇒ **مؤجّل إلى 3C** ✓

## 21) MOBILE REGRESSION (390 و768)

| القياس | قبل | بعد |
|---|---|---|
| «الفلاتر والترتيب» | 44px · يفتح اللوحة | **مطابق** |
| اللوحة | h=692.08 · top=151.92 · 8 حقول · head/foot | **مطابق** |
| البحث/التصنيف/العلامة/الترتيب/السعر/التوفر/العروض | تعمل | **مطابق** |
| «عرض النتائج» / «تفريغ الفلاتر» / الـscrim | تعمل | **مطابق** |
| عند 768 | **لا زر ⇒ اللوحة غير قابلة للفتح** | ✅ **أُصلح** (فتح مطابق لـ390) |

## 22) PRODUCT GRID / CARD REGRESSION

| | قبل | بعد |
|---|---|---|
| بطاقة 390 | 177×**504** | 177×**504** ✓ |
| بطاقة 1024 | 320×**552.14** | 320×**552.14** ✓ |
| أعمدة الشبكة 1024 | `320px 320px 320px` | **مطابق** ✓ |
| أعمدة 1366 | `280×4` | **مطابق** ✓ |
| موضع الشبكة | 214.2 | 412.2 (دفعها الشريط الجديد — متوقّع) ✓ |
⇒ **لم تُلمس البطاقة/الشبكة/الصورة/SKU/CTA** (3D لاحقًا) ✓

## 23) HEADER REGRESSION

- جوال 390: **65px** · شعار 34 · ☰ 44×44 ✓ (بلا تغيير)
- ديسكتوب 1366: **74px** · رابط التنقل 44 ✓ · فائض 0 ✓
- `shop.header.css` لم يُلمس ✓

## 24) HOME REGRESSION (390)

- 5 بطاقات + hero ✓ · بطاقة Home **177×321** (مطابقة تمامًا للقياس قبل) ✓ · فائض 0 ✓
- قائمة الجوال: صف **50px** · drawerTop **65** (= أسفل الهيدر) ✓
- بحث الجوال: sheetTop **65** · خلفية بيضاء ✓

## 25) DARK DESKTOP TOOLBAR

قياس computed على 1366 داكن:

| العنصر | الخلفية | اللون | الحدّ | الحكم |
|---|---|---|---|---|
| الشريط `.shop-toolbar` | `rgb(18,27,43)` = `--store-surface` | `rgb(203,213,225)` | `rgb(30,42,61)` = `--store-border` | ✅ داكن |
| بحث / تصنيف / علامة / ترتيب / minPrice / maxPrice | `rgb(18,27,43)` | `rgb(241,245,249)` | `rgb(34,48,74)` | ✅ داكن (تباين 15.75) |
| التسميات `.shop-toolbar__label` | شفاف | `rgb(148,163,184)` | — | ✅ 6.73 |
| العدّاد `2 منتج` | شفاف | `rgb(148,163,184)` | — | ✅ 6.73 |
| **`.shop-check` (شرائح التوفر والعروض)** | **`rgb(255,255,255)` أبيض** | `rgb(203,213,225)` | `rgb(229,231,235)` | ⛔ **1.48 — كسر قائم** |

**نتيجة صريحة:** الـCSS **الجديد** لا يستخدم أي `--color-*` مكسور ✓ (سطح/حدّ من `--store-*`)، لكن الشريط الجديد **أظهر عيبًا قائمًا** كان مخفيًا على الديسكتوب: شريحتا «المتوفر فقط» و«عليها خصم فقط» بخلفية بيضاء (من `--color-surface` غير المعرّف في `shop.filters.css:15`) — نفس عيب 3A §29 على الجوال.
**لم يُصلَح عمدًا** (Dark Mode legacy = 3F). الإصلاح الجاهز لـ3F: استبدال `var(--color-surface, #fff)` و`--color-border`/`--color-muted` بتوكنز `--store-surface`/`--store-border`/`--store-text-muted` في `shop.filters.css` (سطران) + `.shop-check:has(input:checked)`.

## 26) RTL

- الصف الأول: **البحث يمينًا** ← تصنيف ← علامة ← ترتيب (يسارًا) ✓ الصف الثاني: **السعر** (من — إلى: الأصغر يمينًا؟ لا، الترتيب `من` ثم `—` ثم `إلى` من اليمين لليسار ✓) ← التوفّر ← العروض ← العدّاد ✓
- خصائص منطقية فقط (`padding-inline`, `min-width`) · **لا `left/right` جديدة** ✓ · `justify-self: start` للعدّاد = بداية السطر في RTL ✓

## 27) OVERFLOW MATRIX (17 عرضًا)

| 360 | 390 | 430 | 600 | 640 | 641 | 700 | 768 | 769 | 800 | 900 | 1023 | 1024 | 1280 | 1366 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
`document.scrollWidth === document.clientWidth` في كل عرض ✓ **لا فائض أفقي إطلاقًا** · لا قصّ ولا تراكب.

## 28) CONSOLE / NETWORK

- **Console errors/warnings = 0** · **Failed requests = 0** على كل العروض والرحلات والثيم الداكن ✓
- الطلبات: `products` + `categories` + `brands` لكل تفاعل — **نفس نمط التطبيق قبل التغيير** (لا طلبات جديدة ولا مكرّرة بسبب إعادة الهيكلة).

## 29) NEW !important

| الملف | قبل | بعد |
|---|---|---|
| `shop.css` | 5 | **5** |
| `shop.filters.css` | 0 | **0** |
⇒ **0 `!important` جديد** ✓

## 30) SUCCESS CRITERIA — تحقق بندًا بندًا

| المعيار | النتيجة |
|---|---|
| Mobile ≤768 = Bottom Sheet | ✅ (بما فيها 641–768 التي كانت مكسورة) |
| Desktop/Tablet ≥769 = Toolbar فعلية | ✅ (769: 262px/3 صفوف · 1024+: 182px/صفّان) |
| لا فجوة 769–1023 | ✅ 8/8 عناصر + عدّاد |
| Search / Category / Brand / Sort / Price / In-stock / Offers / Count مرئية | ✅ الثمانية على 769/1024/1366 |
| لا duplicate IDs | ✅ كل معرّف = 1 |
| لا duplicate events | ✅ طلب واحد لكل تفاعل |
| لا overflow | ✅ 17/17 = 0 |
| Product Cards unchanged | ✅ 177×504 · 320×552.14 · نفس الأعمدة |
| Header/Home/Search/Menu unchanged | ✅ 65/74 · Home 177×321 · sheetTop 65 · قائمة 50/65 |
| Filter correctness unchanged | ✅ (السعر/التوفر بلا تغيير — 3C) |
| JS = 0 · DOM = 0 · Routes/API = 0 | ✅ |

## 31) EXACT CHANGES (diff كامل)

**`shop.filters.css`** — داخل كتلة `@media (min-width: 769px)` القائمة:
```css
.shop-filters__sheet { display: contents; }
.shop-filters__sheet-head,
.shop-filters__sheet-foot { display: none; }
.shop-toolbar {
  grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 1fr));
  border-color: var(--store-border);
  background: var(--store-surface);
}
.shop-toolbar__count { justify-self: start; }
```
+ كتلة جديدة بعده:
```css
@media (min-width: 769px) and (max-width: 1023px) {
  .shop-toolbar { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```
**`shop.css`** — سطر واحد:
```diff
-@media (max-width: 640px) {
+@media (max-width: 768px) {
   .shop-filters { display: block; }
   .shop-filters__toggle { display: flex; }
   .shop-toolbar__field--filter { display: none; }
```
**Selectors changed:** `.shop-filters__sheet` · `.shop-filters__sheet-head` · `.shop-filters__sheet-foot` · `.shop-toolbar` · `.shop-toolbar__count` (+ مدى media واحد في `shop.css`).
**Functions changed:** لا شيء (0 JS).

**الإرجاع (سطران):** استعادة `tools/qa/stage3b/backup-shop.filters.css` و`backup-shop.css`.

## 32) SCREENSHOTS

مرافقة (قبل/بعد): 390 أعلى · 390 لوحة مفتوحة · 768 أعلى · 768 لوحة مفتوحة · 769 · 900 · 1024 · 1024 تفاعل · 1366 · 1366 تفاعل · 1366 داكن · 1920 · نتيجة تصنيف 1024 · نتيجة علامة 1024 · Home 390 · بحث 390.

## 33) KNOWN ISSUES — DEFERRED (لم تُصلَح عمدًا)

- `minPrice/maxPrice` لا تُرسل للـAPI ولا تُفلتر محليًا ⇒ **3C**
- `inStock` بلا أثر (القيمة دائمًا `undefined`) ⇒ **3C**
- `offers` فلترة محلية على الصفحة الحالية فقط ⇒ **3C**
- teal كـprimary في الكتالوج + التباينات المكسورة في الثيم الداكن (`.shop-check` 1.48 **وقد ظهرت الآن على الديسكتوب أيضًا** · شارة الخصم 1.94 · زر السلة 2.49 · اللوحة بيضاء على الجوال) + توكنز `--color-*` غير المعرّفة ⇒ **3F** (الإصلاح الجاهز مذكور في §25 — سطران)
- لوحة فلاتر الجوال: Escape · حبس/إعادة التركيز · قفل تمرير · dialog semantics · ترتيب Tab للحقول المخفية ⇒ **3G**
- كثافة البطاقة (صورة 1:1، SKU، تكرار CTA) ⇒ **3D**
- سياق نتائج التصنيف/العلامة (عنوان/مسار) ⇒ **3E**
- الهيكل/الفارغ/الخطأ ⇒ **3F**
- **ملاحظة صغيرة جديدة (بلا أثر بصري):** لو فُتحت اللوحة على الجوال ثم كُبّر العرض ≥769، يبقى `aria-expanded="true"` على زر مخفي (لا يوجد `resize` handler للفلاتر) — لا تأثير بصري/وظيفي؛ يُعالَج مع 3G إن أردت.

**لا بدء لـ3C — STOP بانتظار الموافقة.**