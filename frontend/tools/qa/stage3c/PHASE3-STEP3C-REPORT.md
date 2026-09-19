# PHASE 3 — STEP 3C · FILTER CORRECTNESS & QUERY CONSISTENCY

**النوع:** تصحيح وظيفي (JS فقط) · **التاريخ:** 2026-09-18
**أدوات:** `frontend/tools/qa/stage3c/` (`probe3c.py before|after` · `smoke3c.py` · `shots3c.py`) · JSON: `probe3c-before.json` · `probe3c-after.json`
**نسخ احتياطية:** `backup-shop.js` · `backup-shop.pages.js` + `backup-md5-before.txt`

---

## 1) FILES MODIFIED

| الملف | md5 قبل → بعد |
|---|---|
| `frontend/shop/assets/js/shop.js` | `18784e5c…` → `897310d7…` (+11 سطرًا: `priceNumber` + 4 أسطر في `buildProductQuery`) |
| `frontend/shop/assets/js/shop.pages.js` | `a930c5d4…` → `3b38eeee…` (3 مواضع داخل `renderProducts`) |
| **CSS** | **0 ملفات** (`find … -newermt` على مجلدات CSS = 0) |
| **Backend / DB / Routes / API** | **0 تغييرات** |

`node --check` على الملفين = **OK** · `!important` في JS = 0 (لا معنى له أصلًا) ✓

---

## 2) BACKEND CONTRACT AUDIT (قراءة فقط — قبل أي تعديل)

**DTO:** `src/products/dto/list-products.query.dto.ts` · **Service:** `src/products/products.service.ts:193-258` · **Controller:** `products.controller.ts:23-33`

| parameter | DTO يقبله؟ | validation | service يطبّقه؟ | يؤثر على `total`/`totalPages`؟ | الحكم |
|---|---|---|---|---|---|
| `page` / `limit` | ✅ | `@IsInt @Min(1)` · limit ≤100 | ✅ skip/take | ✅ | مدعوم |
| `search` | ✅ | `@IsString` | ✅ OR على name/sku/slug/shortDescription | ✅ | مدعوم |
| `categoryId` / `brandId` | ✅ | `@IsInt @Min(1)` | ✅ | ✅ | مدعوم |
| `sortBy` / `sortOrder` | ✅ | `@IsIn` | ✅ orderBy | — | مدعوم |
| **`minPrice`** | ✅ | `@IsNumber @Min(0)` — **`-5`/`abc` ⇒ HTTP 400** | ✅ `price: { gte }` (سطر 232-238) | ✅ | **مدعوم server-side** |
| **`maxPrice`** | ✅ | نفسه | ✅ `price: { lte }` | ✅ | **مدعوم server-side** |
| `isFeatured` | ✅ | `@IsBoolean` | ✅ | ✅ | مدعوم (ليس فلترًا في الواجهة — لم يُضف) |
| `includeInventory` | ✅ | `@IsBoolean` | **❌ للزائر:** `withInventory = includeInventory && actor && hasPermission('inventory.read')` | — | **بلا أثر على المتجر العام** |
| **`inStock`** | ❌ **غير موجود في DTO** | — | ❌ | — | **⛔ BLOCKED — API يرفضه** |
| **`offers`** | ❌ **غير موجود في DTO** | — | ❌ | — | **⛔ BLOCKED كفلتر** |
| `hasDiscount` / `discountPercentage` / `compareAtPrice` | — | — | تُحسب في `serialize()` وتُعاد في **كل** عنصر | — | **بيانات متاحة (لا فلتر)** |

**إثبات مباشر على الـAPI الحقيقي (curl، قراءة فقط):**

| الطلب | النتيجة |
|---|---|
| `products?minPrice=400` | HTTP 200 · `total=1` · العنصر = ثلاجة 500 ✓ |
| `products?minPrice=99999` | HTTP 200 · `total=0` |
| `products?minPrice=600&maxPrice=100` | HTTP 200 · `total=0` (لا cross-validation — مقصود) |
| `products?minPrice=350.5` | HTTP 200 · `total=1` (الكسور مسموحة) |
| `products?minPrice=-5` | **HTTP 400** `minPrice must not be less than 0` |
| `products?minPrice=abc` | **HTTP 400** `must be a number` |
| **`products?inStock=1`** | **HTTP 400** `property inStock should not exist` |
| **`products?offers=1`** | **HTTP 400** `property offers should not exist` |
| `products?includeInventory=true` | HTTP 200 لكن **مفاتيح العنصر لا تتغيّر** (لا `inventory`/`inStock`) |

**مفاتيح عنصر القائمة (response) الفعلية:**
`brand, category, compareAtPrice, createdAt, discountPercentage, hasDiscount, id, images, isActive, isFeatured, name, price, primaryImage, shortDescription, sku, slug, updatedAt`
⇒ **لا `inStock` ولا `inventory` إطلاقًا** (مقيس قبل وبعد، ومع `inStock=1` في الـhash) — `inStock` يُضاف فقط في **تفاصيل المنتج** (`findBySlugOrId` سطر 273-277).

---

## 3) buildProductQuery — BEFORE / AFTER

**قبل:** `page, limit, search, categoryId, brandId, sortBy, sortOrder` فقط.
**بعد:** + `minPrice`, `maxPrice` مع تحويل آمن:
```js
function priceNumber(value) {
  if (value === null || value === undefined) return null;
  var raw = String(value).trim();
  if (!raw) return null;
  var number = Number(raw);
  if (!isFinite(number) || number < 0) return null;   // لا NaN · لا سالب · لا فراغ
  return number;
}
…
if (minPrice !== null) query.minPrice = minPrice;
if (maxPrice !== null) query.maxPrice = maxPrice;
```
**allowlist لم تتغيّر** (`ALLOWED_PRODUCT_PARAMS` كما هي) ⇒ لا مفاتيح عشوائية ✓ · **`inStock`/`offers` لا يُرسلان أبدًا** (كانا ولن يكونا — الـAPI يرفضهما بـ400) ✓

## 4) الفلاتر التي أصبحت Server-side
`search` · `categoryId` · `brandId` · `sort` · **`minPrice`** · **`maxPrice`** — وكلها تؤثر على `meta.total`/`totalPages` ✓

## 5) الفلاتر التي تبقى Local
- **`offers`** — فلترة على عناصر الصفحة الحالية (`p.hasDiscount === true`). العدد المعروض يُحسب من `items.length` عند تطبيقه ✓ (لا تناقض مع ما يُعرض، لكنه ليس إجمالي الكتالوج).
- **`inStock`** — لا أثر (القيمة `undefined` دائمًا؛ الكود `p.inStock !== false` يمرّر كل شيء).

## 6) BLOCKED BY BACKEND CONTRACT
- **inStock:** لا parameter · الـAPI **يرفض** `inStock` بـ400 · `includeInventory` يتطلب صلاحية `inventory.read` غير متاحة للزائر ⇒ **لا يمكن أن يكون server-side**، ولا يجوز جلب كل المنتجات وفلترتها محليًا (ممنوع صريحًا) ⇒ **لم أُصلحه ولم أخترع حلًا**.
- **offers كفلتر server-side:** لا parameter · الـAPI يرفض `offers` بـ400 ⇒ يبقى محليًا بحدوده الموثّقة.
- **المطلوب لاحقًا من الـBackend (STOP — قرار لك):** إضافة `inStock?: boolean` (أو `availability`) إلى DTO + فلترة على `inventory.quantity - reservedQuantity > 0` مع **إتاحة `includeInventory`/`inStock` للطلب العام**، و`offers?: boolean` (فلترة `compareAtPrice > price`)، وإعادتهما في `meta.total`.

## 7) MIN PRICE — اختبارات (1366)

| السيناريو | الطلب المُرسل | بطاقات | `meta.total` | العدّاد المعروض |
|---|---|---|---|---|
| `minPrice=400` | `…&minPrice=400` | 1 | 1 | **1 منتج** ✓ |
| `minPrice=0` | `…&minPrice=0` | 2 | 2 | 2 منتج ✓ |
| `minPrice=350.5` | `…&minPrice=350.5` | 1 | 1 | 1 منتج ✓ |
| `minPrice=99999` | `…&minPrice=99999` | **0** | **0** | **0 منتج** ✓ (حالة فارغة) |

## 8) MAX PRICE — اختبارات

| السيناريو | الطلب | بطاقات | total | العدّاد |
|---|---|---|---|---|
| `maxPrice=400` | `…&maxPrice=400` | 1 | 1 | 1 منتج ✓ |
| `maxPrice=0` | `…&maxPrice=0` | 0 | 0 | 0 منتج ✓ |
| `maxPrice=1` | `…&maxPrice=1` | 0 | 0 | 0 منتج ✓ |

## 9) PRICE RANGE

| السيناريو | الطلب | بطاقات/total/عدّاد |
|---|---|---|
| `minPrice=400&maxPrice=550` | `…&minPrice=400&maxPrice=550` | 1 / 1 / «1 منتج» ✓ |
| `minPrice=600&maxPrice=100` (غير صالح) | `…&minPrice=600&maxPrice=100` | 0 / 0 / «0 منتج» ✓ |
**القرار (موثّق):** لا cross-validation في الواجهة ولا في الـAPI ⇒ نُرسل النطاق كما هو، والنتيجة **مجموعة فارغة صادقة** + حالة فارغة + عدّاد 0 (لا تناقض، ولا UX جديد) — أقل معالجة صحيحة وآمنة ✓

## 10) ZERO / EMPTY / MALFORMED / NEGATIVE

| الحالة | هل أُرسل؟ | النتيجة |
|---|---|---|
| `minPrice=` / `maxPrice=` (فراغ) | ❌ لا يُرسل | 2 منتج (بلا فلتر) ✓ |
| `minPrice=abc` | ❌ لا يُرسل | 2 منتج ✓ **بلا 400** |
| `minPrice=-5` | ❌ لا يُرسل | 2 منتج ✓ **بلا 400** |
| `minPrice=0` | ✅ يُرسل `0` | 2 منتج ✓ (صالح وفق العقد) |
| `minPrice=350.5` | ✅ يُرسل | 1 منتج ✓ |
⇒ لا يُرسل `NaN`/`undefined`/`""`/سالب إطلاقًا ✓ (مُثبت بلا أي خطأ API)

## 11) IN-STOCK — النتيجة

**BLOCKED BY BACKEND CONTRACT.** إثبات: `products?inStock=1` ⇒ **HTTP 400 «property inStock should not exist»** · ومفاتيح العنصر لا تحوي `inStock` ولا `inventory` حتى مع `includeInventory=true` ⇒ لا توجد طريقة صحيحة لعرض «المتوفر فقط».
**ما فعلته:** **لا شيء** (لم أُرسل المعامل، لم أُفلتر محليًا، لم أُغيّر الـUX). الخانة تبقى كما هي وتغيّر الـhash فقط — **سلوكها الحالي بلا أثر** (موثّق، ومقترح التعطيل/الإزالة في 3E أو عند توفر العقد). لم أعتمد على العدد وحده للحكم ✓

## 12) OFFERS — النتيجة

- **لا يوجد فلتر server-side** (400 كما أعلاه) ⇒ بقي محليًا على عناصر الصفحة.
- اختبار: `offers=1` ⇒ الطلب **بلا** أي معامل إضافي، **بطاقة واحدة** (المنتج المخفّض −16.67%)، `meta.total=2`، العدّاد المعروض **«1 منتج»** = عدد ما يُعرض فعلًا ✓ (لا تناقض ظاهر، لكنه ليس إجمالي الكتالوج — **محدودية موثّقة**؛ تصبح غير دقيقة إذا تجاوز عدد المنتجات حجم الصفحة `limit=12`).

## 13) META TOTAL — الصحة

| الحالة | `meta.total` (API) | العدّاد المعروض | متوافق؟ |
|---|---|---|---|
| بلا فلتر | 2 | 2 منتج | ✓ |
| search / category / brand | 2 / 2 / 1 | مطابق | ✓ |
| minPrice / maxPrice / range | 1 / 1 / 1 | مطابق | ✓ |
| `minPrice=99999` | 0 | 0 منتج | ✓ (كان قبل: «2 منتج» مع 0 بطاقات ✗) |
| `page=2` | 2 | 2 منتج + بطاقتان | ✓ (كان قبل: 0 بطاقات + «2 منتج» ✗) |
| offers (محلي) | 2 | 1 منتج | ✓ مقابل المعروض (محدودية موثّقة) |

## 14) PAGE خارج النطاق — السبب والإصلاح

- **السبب:** الـAPI يعيد `items: []` مع `meta.total=2` و`totalPages=1` ⇒ الكود يرسم الحالة الفارغة، والعدّاد يُبنى من `meta.total` ⇒ تناقض.
- **الإصلاح (أقل تصحيح آمن):** قبل أي رسم، إذا `items` فارغة **و`meta.total > 0` و`page > totalPages`** ⇒ إعادة توجيه الـhash إلى نفس الفلاتر **بلا `page`** ⇒ تُعرض الصفحة 1 بالنتائج الصحيحة.
  - لا يتدخّل عند الفراغ الحقيقي (`total = 0`) ✓ · ولا عند الفراغ الناتج عن فلتر محلي ✓ · لا حلقة (بعد التوجيه `page=1 ≤ totalPages`) ✓
  - **الطلبات:** طلبان للمنتجات في هذه الحالة فقط (طلب الصفحة غير الصالحة ثم الصفحة 1) — موثّق، وليس تضاعفًا في التفاعلات العادية.

## 15) PAGE RESET + ضجيج page=1

- تغيير أي فلتر (search/category/brand/sort/price/inStock/offers) ⇒ الصفحة تعود إلى 1 (الافتراضي) ✓
- **إزالة ضجيج `page=1`:** كان `#/products?page=1&categoryId=293` ⇒ الآن **`#/products?categoryId=293`** ✓ (تغيير سطرين، لا يمسّ الصيغة/الدلالة؛ `page` يبقى ظاهرًا عند ≠1 مثل `page=2`) ✓

## 16) HASH / QUERY

- الصيغة كما هي `#/products?key=value&…` ✓ · القيم الفارغة/غير الصالحة **لا تُرسل** للـAPI ولا تُثبَّت ✓ · لا مفاتيح خارج الـallowlist ✓ · `minPrice=400` يظهر في الـhash ويُملأ في الحقل تلقائيًا ✓

## 17) RELOAD · BACK / FORWARD

| الاختبار | النتيجة |
|---|---|
| `?page=1&categoryId=293&minPrice=400` → تحديث | ✅ الحالة والحقول والنتائج كما هي |
| back | ✅ `#/products?categoryId=293` |
| forward | ✅ يعود للفلاتر الكاملة |
| `#/products?page=2` | ✅ يتحوّل إلى `#/products` مع بطاقتين وعدّاد 2 |

## 18) COMBINATIONS

| التركيب | الطلب | النتيجة |
|---|---|---|
| `categoryId=293&brandId=254` | `…&categoryId=293&brandId=254` | 1 / total 1 ✓ |
| `brandId=254&minPrice=400` | `…&brandId=254&minPrice=400` | **0** / total 0 ✓ (منتج العلامة 350 < 400) |
| `search=ثلاجة&maxPrice=400` | `…&search=ثلاجة&maxPrice=400` | 1 / total 1 ✓ |
| `offers=1&minPrice=400` | `…&minPrice=400` (+فلترة محلية) | 1 / total 1 ✓ |
| `inStock=1&brandId=254` | `…&brandId=254` (inStock لا يُرسل) | 1 / total 1 ✓ |

## 19) MOBILE/DESKTOP PARITY

| hash | 390 | 1024 | 1366 |
|---|---|---|---|
| `?minPrice=400` | 1 / «1 منتج» | 1 / «1 منتج» | 1 / «1 منتج» |
| `?maxPrice=400` | 1 | 1 | 1 |
| `?offers=1` | 1 | 1 | 1 |
| `?page=2` | → `#/products` + 2 | نفسه | نفسه |
⇒ **نفس المجموعة على كل عرض** (العرض مختلف فقط) ✓

## 20) REQUEST COUNT (قبل/بعد)

- **قبل:** طلب `products` واحد لكل تفاعل ✓ (لكن بلا معاملات السعر).
- **بعد:** **طلب واحد لكل تفاعل** ✓ (`minPrice`/`maxPrice` تُضاف لنفس الطلب — لا طلب إضافي) — مقارنة مباشرة: 9 تفاعلات × 1 طلب في الوضعين ✓ **لا زيادة في عدد الطلبات** ✓
- الاستثناء الموثّق: الصفحة خارج النطاق = طلبان (تصحيح تلقائي).

## 21) EMPTY STATE

- `minPrice=99999` / `maxPrice=1` / نطاق غير صالح ⇒ حالة فارغة **«لا توجد منتجات مطابقة»** + **عدّاد «0 منتج»** ✓ (كان العدّاد يقول «2 منتج» قبل) — **بلا أي تغيير في تصميم الحالة** ✓

## 22) API ERRORS

- **0 أخطاء** (لا 400/500) في كل السيناريوهات — بما فيها القيم غير الصالحة (تُسقَط قبل الإرسال) ✓
- لم أُرسل أي parameter يرفضه الـAPI (`inStock`/`offers`/`isFeatured` لا تُرسل) ✓

## 23) CONSOLE / NETWORK

- Console errors/warnings = **0** · Failed requests = **0** (قبل وبعد) ✓

## 24) PRODUCT CARD — أثر جانبي

- **لا تغيير** في `shop.productCard` أو markup البطاقة ✓
- **أثر وظيفي موثّق:** بما أن قائمة الـAPI لا تُرجع `inStock`، **شارة «متوفر/غير متوفر» لا تظهر** على البطاقة (كما كان قبل 3C تمامًا). إذا أضفت الـBackend لاحقًا `inStock` للقائمة، ستظهر الشارة **تلقائيًا من الـmarkup القائم** — أُوثّق ذلك ولن أُجمّله هنا (3D) ✓

## 25) 3B REGRESSION

| العرض | Toolbar | الصفوف | الارتفاع | تحكم مرئي | العدّاد | بطاقة | هيدر | فائض |
|---|---|---|---|---|---|---|---|---|
| 390 | في اللوحة (block) + toggle | 2 | 132 | 1 | ✓ | 177×504 | 65 | 0 |
| 768 | في اللوحة + toggle | 2 | 132 | 1 | ✓ | 237×491 | 65 | 0 |
| 769 | inline (contents) | **3** | **262** | **8** | ✓ | 238×491 | 65 | 0 |
| 1024 | inline | **2** | **182** | 8 | ✓ | 320×552 | 74 | 0 |
| 1366 | inline | 2 | 182 | 8 | ✓ | 280×512 | 74 | 0 |
⇒ **مطابق حرفيًا لقياسات 3B** ✓

## 26) HEADER / HOME / SEARCH / MENU REGRESSION (390)

`homeCards 5` · `hero true` · `listingCard 177×504` · `searchSheet top 65 / أبيض` · `menu rowH 50 · drawerTop 65` · `overflow 0` — **مطابق للقياس قبل التعديل** ✓

## 27) CSS FILES MODIFIED = **0**  ·  28) BACKEND FILES MODIFIED = **0**

## 29) EXACT CHANGES

**`shop.js`** — إضافة `priceNumber()` (11 سطرًا) قبل `buildProductQuery` + 4 أسطر داخله (`minPrice`/`maxPrice`).
**`shop.pages.js`** — داخل `renderProducts`:
1. نقل `page`/`totalPages` للأعلى + `hasLocalFilters` + **بوابة الصفحة خارج النطاق** (إعادة توجيه بلا `page`).
2. `apply()`: `delete merged.page` عند تغيير فلتر + حذف `page` عندما = 1.
3. حذف التعريف المكرّر لـ`page`/`totalPages` قبل كتلة الترقيم (استُخدم التعريف الأعلى).
**الإرجاع:** `cp tools/qa/stage3c/backup-shop.js shop/assets/js/shop.js` + مثله لـ`shop.pages.js`.

## 30) KNOWN LIMITATIONS

1. **inStock** — BLOCKED (يحتاج `inStock` في DTO + فلترة مخزون + إتاحتها للطلب العام + إعادتها في `meta.total`). الخانة بلا أثر حاليًا.
2. **offers** — محلي على الصفحة؛ دقيق فقط عندما تكون النتائج في صفحة واحدة (`total ≤ 12`). الحل الصحيح = parameter `offers`/`hasDiscount` في الـDTO.
3. **السعر** — يعمل server-side ✓، لكن عند إدخال `min > max` النتيجة فارغة (قرار موثّق).
4. **العدّاد مع الفلاتر المحلية** = عدد ما يُعرض في الصفحة (لا إجمالي الكتالوج).
5. **الصفحة خارج النطاق** = طلبان للمنتجات (تصحيح تلقائي).
6. **`categories`+`brands` يُعاد طلبهما مع كل فلتر** — خارج نطاق 3C (لا caching) ولم يزد العدد.
7. لا يمكن اختبار الترقيم الكامل (`totalPages=1`) — NOT TESTABLE WITH CURRENT REAL DATA.

## 31) SCREENSHOTS / RAW QA

`before-minPrice400.png` · `after-minPrice400.png` · `before-minPrice99999.png` · `after-minPrice99999.png` · `before-page2.png` · `after-page2.png` · `before-offers.png` · `after-offers.png` · `before-ui-end-1366.png` · `after-ui-end-1366.png` — والبيانات الخام في `probe3c-before.json` / `probe3c-after.json`.

**لم أبدأ 3D/3F · لم ألمس CSS/Backend · inStock وoffers موثّقان كـBLOCKED بلا اختراع حل — STOP بانتظار الموافقة.**