# PHASE 0 — NEW STOREFRONT REBUILD · ARCHITECTURE + BEHAVIOR CONTRACT AUDIT
### Tailwind CSS + Cairo + Arabic RTL · AUDIT ONLY

**SOURCE FILES MODIFIED = 0** (خلال Phase 0) · **DEPENDENCIES INSTALLED = 0** · **TAILWIND INSTALLED = NO** · **FONT INSTALLED = NO** · **BACKEND/API/DB/ROUTES = 0**
آخر تعديل على مصدر المتجر كان مهمة شريط الإعلانات السابقة (`shop.pages.js` + `shop.home.css` @08:04) **قبل** بدء Phase 0. Phase 0 أضاف ملفات تدقيق فقط تحت `tools/qa/stage0/` + لقطة `md5-phase0.txt` (27 ملفًا).

---

## 1. EXECUTIVE ARCHITECTURE SUMMARY

**ما هو المتجر تقنيًا:** تطبيق **Vanilla JS** بمعمارية SPA-lite على **hash router**، يُولّد الـDOM بالكامل من JS (`el()` helper) داخل حاوية واحدة `#shop-view`.

| البند | الرقم |
|---|---|
| HTML entry | **1** (`shop/index.html` · 17.5 KB) |
| CSS المتجر | **5 ملفات** (178 KB خام · **39 KB gzip**) |
| CSS مشترك محمّل | **3** (`tokens.css` · `base.css` · `components.css`) |
| CSS مشترك **غير** محمّل في المتجر | `layout.css` (للأدمن فقط ✓) |
| JS المتجر | **17 ملفًا** (321 KB خام · 74 KB gzip) |
| JS مشترك محمّل | **6** (`core/api·config·format·session·auth·permissions` + `router` عبر app) |
| مسارات | **13** route |
| نداءات API | **29** |
| عقد DOM الذي يعتمد عليه JS | **26 ID · 38 محددًا · 14 صنف حالة · 3 `data-*` · 15 `aria-*`** |
| قواعد CSS | **1,035 قاعدة** |

**الخلاصة الحاسمة:** الـ**عرض** يمكن استبداله بالكامل (CSS + بنية DOM + التنسيق) **دون لمس** ما يلي: الموجّه (`parseHash`/`buildHash`) · عميل الـAPI · عقود بيانات المُصيّرات · عقد DOM (المعرّفات/الأصناف/الحالات) · سلوك الثيم · دلالات الإتاحة. **الخطر الحقيقي ليس في التنسيق بل في كسر عقد DOM** الذي تقرأه الـJS.

---

## 2. CUSTOMER STOREFRONT FILE MAP

| الملف | الغرض | المستهلكون | عرضي؟ | سلوكي؟ | آمن للاستبدال لاحقًا؟ | مشترك خارج المتجر؟ |
|---|---|---|---|---|---|---|
| `shop/index.html` | الهيكل + تحميل الأصول + skip-link | — | نعم | جزئيًا (حاويات `#shop-view`) | **نعم** (يُعاد كتابته) | لا |
| `shop/assets/css/shop.css` | الطبقة الأساسية للمتجر (83.5 KB · 570 قاعدة) | كل الصفحات | نعم | **نعم** (drawer/modal/card/gallery/states) | نعم بعد الترحيل | لا |
| `shop/assets/css/shop.header.css` | الهيدر + الدُرج + 3 `@font-face` (52 KB · 239 قاعدة) | الهيدر/القائمة | نعم | **نعم** (فتح/إغلاق/قفل تمرير) | نعم | لا |
| `shop/assets/css/shop.home.css` | الرئيسية (شريط/سلايدر/أقسام) (19.7 KB) | الرئيسية | نعم | **نعم** (شريط متحرك + سلايدر) | نعم | لا |
| `shop/assets/css/shop.search.css` | لوحة البحث (17 KB) | البحث | نعم | **نعم** (open/close/lock) | نعم | لا |
| `shop/assets/css/shop.filters.css` | لوحة الفلاتر (6 KB) | الكتالوج | نعم | **نعم** (modal + visibility) | نعم | لا |
| `assets/css/tokens.css` | توكنز دلالية (`--store-*` · `--st-*` · `--space-*` …) | **المتجر + الأدمن** | نعم | لا | **إضافة فقط** | **نعم** ⚠️ |
| `assets/css/base.css` | reset + `@font-face` Cairo + a11y أساسيات | **المتجر + الأدمن** | نعم | لا | **إضافة فقط** | **نعم** ⚠️ |
| `assets/css/components.css` | أزرار/حقول/بطاقات/تنبيهات/مودالات (37 KB) | **المتجر + الأدمن** | نعم | لا | **توسيع فقط** | **نعم** ⚠️ |
| `assets/js/core/*.js` | api · config · format · session · auth · permissions · router | المتجر + الأدمن | لا | **نعم** | **لا** (منطق) | **نعم** ⚠️ |
| `shop/assets/js/shop.app.js` | إقلاع المتجر + الموجّه + الجلسة + الثيم + toast (25 KB) | كل الصفحات | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.js` | أدوات مشتركة: `el` · `money` · `productCard` · `api` · `parseHash` · `stateBlock` (31 KB) | الكل | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.pages.js` | مُصيّرات الصفحات (home/products/product/login/register) + الفلاتر + a11y (61.5 KB) | الكتالوج/الرئيسية/PDP | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.header.js` | الهيدر/الدُرج/الأفاتار/الثيم (15.8 KB) | الهيدر | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.search.js` | لوحة البحث + debounce + نتائج (12.7 KB) | البحث | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.cart.js` / `cart-ui.js` / `cart-page.js` | منطق السلة + واجهتها + الصفحة (16.5 KB) | السلة/العدّاد | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.checkout-page.js` | الدفع (12 KB) | الدفع | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.account-page.js` · `orders-page.js` · `order-page.js` · `order-flow.js` · `payment-page.js` · `notifications-page.js` · `verification-page.js` | أسطح الزبون (84 KB) | الحساب/الطلبات/الإشعارات/التوثيق | لا | **نعم** | لا | لا |
| `shop/assets/js/shop.icons.js` | أيقونات SVG (5.3 KB) | الكل | نعم | لا | نعم (تبقى) | لا |
| `shop/assets/fonts/*` | 3 ملفات Qomra woff2 (26 KB ×3) | **صفر مرجع** ✗ | — | لا | **مرشّحة للتقاعد** | لا |
| `assets/fonts/Cairo-Regular.ttf` | الخط المُضمَّن (585.5 KB) | المتجر + الأدمن | نعم | لا | يُحوَّل إلى WOFF2 | **نعم** ⚠️ |
| `shop/PRODUCT.md` · `DESIGN.md` · `README.md` · `.impeccable/*` | توثيق | — | — | لا | تُحدَّث | لا |

**CSS يحتوي قواعد سلوكية (لا تفترض أنه تنسيق فقط):** `display:none` (تبديل اللوحات) · `visibility:hidden` (لوحة الفلاتر المغلقة — تمنع التركيز) · `position:fixed` + `z-index` (الدُرج/البحث/المودال/التوست) · `overflow:hidden` (قفل التمرير + مسرح المعرض) · قواعد التركيز (`:focus-visible`) · `prefers-reduced-motion` · `.visually-hidden` · `is-open/is-closing/is-opening/is-active/is-scrolled/btn--busy` · `@keyframes` الشريط/السلايدر (توقيت مرتبط بـJS: `finish` بعد 240ms).

---

## 3. ROUTE MAP (المصدر: `shop.js:56` — `ROUTES`)

| # | النمط | الاسم | المُصيّر | بارامترات | حالات |
|---|---|---|---|---|---|
| 1 | `#/` | home | `shop.pages.home` | — | تحميل الأقسام + شريط + سلايدر |
| 2 | `#/products` | products | `shop.pages.products` | query: `page·limit·search·categoryId·brandId·sortBy·sortOrder·minPrice·maxPrice·isFeatured·inStock·offers·includeInventory` | loading (skeleton + `aria-busy`) · empty (`role=status`) · error (`role=alert` + إعادة محاولة) |
| 3 | `#/products/:id` | product | `shop.pages.product` | `id` (رقم أو slug) | loading · not-found (`role=status`) · error |
| 4 | `#/login` | login | `loginPage` | — | نموذج + خطأ (`shop-auth__error-text`) |
| 5 | `#/register` | register | `registerPage` | — | نموذج + خطأ |
| 6 | `#/cart` | cart | `ALW.shopPages.cart` | — | زائر ⇒ CTA مصادقة · مسجّل ⇒ عناصر/كميات |
| 7 | `#/checkout` | checkout | `ALW.shopPages.checkout` | — | معاينة (`/checkout/preview`) + خطأ (`#shop-checkout-error`) |
| 8 | `#/account` | account | `ALW.shopPages.account` | — | محمي (زائر ⇒ مصادقة) |
| 9 | `#/orders` | orders | `ALW.shopPages.orders` | — | محمي · فارغ/خطأ |
| 10 | `#/orders/:id` | order | `ALW.shopPages.order` | `id` | محمي · إلغاء بسبب (`#shop-cancel-reason`) |
| 11 | `#/orders/:id/payment` | payment | `ALW.shopPages.payment` | `id` | محمي · `sham-cash` |
| 12 | `#/notifications` | notifications | `ALW.shopPages.notifications` | — | محمي · غير مقروء |
| 13 | `#/verification` | verification | `ALW.shopPages.verification` | — | محمي · `start/cancel` |
| — | أي مسار آخر | notfound | `shop.pages.notfound` | — | 404 داخل التطبيق (`#/payment` و`#/order` مثالان مؤكّدان بالقياس ✓) |

**آلية التنقّل:** `location.hash` + `hashchange` (لا History API ✗) · `parseHash` يطابق `ROUTES` بالترتيب · `buildHash` لبناء الروابط · إعادة توجيه `page=2` عند عدم وجود نتائج (3C ✓).

---

## 4. API CONTRACT MAP (29 نداءً · المصدر: `assets/js/core/api.js` + المتجر)

| المجموعة | النداءات | مصادقة؟ | زائر آمن؟ |
|---|---|---|---|
| المنتجات | `GET /products` · `GET /products/:id` · `GET /categories` · `GET /brands` | لا | **نعم** |
| السلة | `POST /cart/items` · `PATCH /cart/items/:id` · `GET /cart` | نعم | لا |
| الدفع | `POST /checkout/preview` · `POST /orders` · `GET /orders` · `GET /orders/:id` | نعم | لا |
| المصادقة | `POST /auth/login` · `register` · `refresh` · `logout` · `logout-all` · `change-password` · `GET /auth/sessions` | مختلط | نعم (login/register) |
| الحساب | `GET /users/me` · `PATCH /users/me` | نعم | لا |
| الإشعارات | `GET /notifications` · `GET /notifications/unread-count` · `GET/PATCH /notifications/preferences` · `POST /notifications/:id` · `POST /notifications/read-all` | نعم | لا |
| التوثيق | `GET /verification/me` · `POST /verification/start` · `POST /verification/cancel` | نعم | لا |
| الدفع اليدوي | `GET /payments` · `GET /payments/:id` · `GET /payments/sham-cash/account` · `POST /payments` | نعم | لا |

**نقطة حرجة مؤكَّدة بالقياس (أُعيد التحقق):**
- `GET /products/:id` **يرجّع `inStock` صادقًا** ✓ (632 = `true` · 633 = `false` — مقيس في 4A و4B و5F ✓).
- `GET /products` (**القائمة**) **لا يدعم** تصفية `inStock` صادقة server-side ✗ (طلبها ⇒ 400 في 3C ✓) ⇒ تحكّم «المتوفر فقط» **مخفي عن الزبون حاليًا** ✓ (3G.1 ✓ · مقيس: 0 عنصر مرئي/قابل للتركيز ✓).
- `offers` **محلي على الصفحة المحمّلة فقط** ✓.
- `includeInventory`/`isFeatured` ضمن `ALLOWED_PRODUCT_PARAMS` ✓ (سلوكها كما في 3C ✓).

**خطأ/تحميل:** كل مُصيّر يستخدم `stateBlock` (loading/empty/error ✓) + `role=status/alert` + زر إعادة محاولة 44px ✓.

---

## 5. DATA MODEL MAP (الحقول المستهلكة فعليًا)

| الكيان | الحقول | التصنيف |
|---|---|---|
| **Product** | `id` `name` `slug` `sku` `price` `compareAtPrice` `hasDiscount` `discountPercentage` `images[]` `primaryImage` `shortDescription` `description` `specifications[]` `brand` `category` `isFeatured` | `id/name/price` **مطلوبة** · `slug/sku/images/primaryImage` **nullable** (المنتجان التجريبيان بلا صور ✗) · `description` **nullable** (يُسقط إلى `shortDescription` ✓) · `specifications[]` **غالبًا فارغة** · `discountPercentage` **مشتق** |
| **Product (تفاصيل فقط)** | `inStock` | **صادق على PDP فقط** ✓ (nullable/غير معرّف ⇒ سلوك محايد ✓) |
| **Category / Brand** | `id` `name` `slug` `count?` | `count` **اختياري** |
| **CartItem** | `id` `productId` `quantity` `price` `product{...}` | `product` **متداخل** |
| **User** | `id` `name` `email` `phone` `role` `verification?` | `verification` **اختياري** |
| **Order** | `id` `status` `total` `items[]` `createdAt` `payment?` | `payment` **اختياري** |
| **Notification** | `id` `title` `body` `read` `createdAt` | — |
| **SearchResult** | نفس شكل Product (مختصر) | — |

**ممنوع الاختلاق:** لا صور ولا أوصاف ولا مواصفات للمنتجين الحاليين ✓ ⇒ **لا يمكن تصميم «product-first premium» على محتوى حقيقي قبل توفير بيانات/صور فعلية** (blocker #29 ✓).

---

## 6. RENDERER / HELPER MAP

| المساعد | الملف | المستهلكون | يعتمد على بنية DOM؟ | آمن للاستبدال؟ |
|---|---|---|---|---|
| `el(tag, {class,text,attrs,onclick}, children)` | `shop.js` | **كل** المُصيّرات | لا (يُنتج DOM) | **لا** (عمود فقري) |
| `productCard(model)` + `productCardModel()` | `shop.js` | الرئيسية · الكتالوج · **المشابهة** | نعم (أصناف `shop-card*`) | يُعاد كتابته بصريًا (بنفس العقد) |
| `imageNode()` | `shop.js` | البطاقات/المعرض | نعم | نعم (بصريًا) |
| `money()` | `shop.js` | كل الأسعار | لا | **لا** (منطق عرض) |
| `stateBlock()` / `loadingBlock()` | `shop.js` | كل الصفحات | نعم (`state`/`role`) | نعم (بشرط حفظ الدلالات) |
| `grid()` · `crumbs()` · `fact()` · `errorBlock()` · `sectionHead()` · `productIconSvg()` | `shop.pages.js` | الصفحات | نعم | نعم |
| `taxonomy()` | `shop.pages.js` | التصنيفات/العلامات | نعم | نعم |
| `homeTicker()` · `homeSlider()` | `shop.pages.js` | الرئيسية | نعم + توقيت JS↔CSS | نعم |
| `filterA11y` (dialog/trap/Escape/restore/lock) | `shop.pages.js` | لوحة الفلاتر | **نعم** (حصر التركيز ديناميكي ✓) | يُعاد استخدامه كما هو ✓ |
| `toast()` | `shop.app.js` | الكل | نعم (`#shop-toasts`) | نعم |
| `api` (core) | `core/api.js` | الكل | لا | **لا** |

---

## 7. DOM / JS COUPLING — «DO NOT BREAK» CONTRACT

**المعرّفات (26):** `#shop-view` · `#shop-burger` · `#shop-drawer` · `#shop-drawer-close` · `#shop-drawer-account` · `#shop-menu-scroll` · `#shop-menu-user` · `#shop-menu-guest` · `#shop-menu-account` · `#shop-user-btn` · `#shop-actions` · `#shop-year` · `#shop-toasts` · `#shop-search-sheet` · `#shop-search-sheet-input` · `#shop-search-form` · `#shop-search-input` · `#shop-search-results` · `#shop-search-clear` · `#shop-search-close` · `#shop-search-suggest` · `#shop-search-suggest-list` · `#shop-filters` · `#shop-filters-toggle` · `#shop-toolbar` · `#shop-checkout-error` + `#shop-filter-{search,category,brand,sort,minprice,maxprice,offers}` · `#shop-cancel-reason` · `#shop-cancel-error` · `#shop-qty` · `#shop-add-to-cart` · `#shop-home-slide-cta-*`

**محددات يستخدمها JS (38):** `.shop-header` · `.shop-nav__link` · `.shop-drawer__link` · `.shop-menu__link` · `.shop-menu__stagger` · `.shop-drawer__group-title` · `.shop-menu__divider` · `.shop-menu__theme-btn(.is-active)` · `.shop-menu__theme(-thumb)` · `.shop-profile-menu__item` · `.shop-drawer__panel` · `.shop-drawer.is-open` · `.shop-search-sheet.is-open` · `.shop-filters__sheet` · `.shop-home-slider__arrow--{prev,next}` · `.shop-footer__sec` · `.shop-notif__head` · `.modal__panel` · `.modal__foot .btn` · `.badge` · `.shop-auth__error-text` · `.shop-section--related-error` · `.shop-cart__item--busy` · `.shop-notif--unread` + حصر التركيز: `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`

**`closest()`:** `#shop-search-btn` · `#shop-user-btn` · `#shop-burger, a, button`

**`data-*` (3):** `data-theme` (على `<html>`) · `data-theme-mode` (على أزرار الثيم) · `data-api-base` (إعداد الـAPI) + `[data-drawer-close]` (إغلاق الدُرج)

**أصناف الحالة (14):** `is-open` ×19 · `btn--busy` ×12 · `is-opening` ×9 · `is-closing` ×7 · `is-active` · `is-filters-open` · `is-scrolled` · `toast--leaving` · `shop-cart__item--busy` · `shop-notif--unread` · `shop-home` (على `<html>`)

**`aria-*` المستخدمة (15):** `label`×40 · `hidden`×34 · `expanded`×12 · `pressed`×6 · `current`×5 · `modal`×4 · `labelledby`×4 · `live`×4 · `controls`×3 · `atomic`×3 · `haspopup`×2 · `busy`×2 · `roledescription`×2 · `selected`×2 · `describedby`×2

> **القاعدة للمرحلة القادمة:** أي إعادة تصميم **يجب** أن تُبقي هذه المعرّفات والأصناف والدلالات — أو تُحدَّث الـJS معها في نفس الخطوة (وهذا ما يجب تجنّبه).

---

## 8. AUTHENTICATION CONTRACT

- **الزائر:** تصفّح/بحث/فلترة كامل ✓ · الإضافة للسلة ⇒ **مودال مصادقة** (`role=dialog` + `aria-modal` + حصر تركيز + Escape + إرجاع تركيز ✓) بـ3 خيارات (دخول/إنشاء حساب/متابعة التصفح ✓) — مقيس: 101×47 · 90×47 · 102×47 ✓.
- **مسجّل:** `POST /auth/login` ⇒ توكن (session في `core/session.js`) · `refresh` تلقائي ✓ · `logout`/`logout-all` ✓.
- **الأسطح المحمية:** cart · checkout · account · orders · order · payment · notifications · verification ⇒ زائر يرى حالة «تسجيل الدخول مطلوب» ✓ (مقيس: `#/verification` ✓).
- **يعتمد على DOM:** `.modal__panel` · `.modal__foot .btn` · `.shop-auth__error-text` · `role=dialog` · `aria-modal` · `#shop-toasts`.
- **لا يُعدَّل** ✗.

---

## 9. CART CONTRACT

- الإضافة: `POST /cart/items` (من بطاقة/صفحة المنتج ✓) · التحديث/الحذف: `PATCH /cart/items/:id` · القراءة: `GET /cart` ✓.
- الحالة البصرية أثناء الطلب: `btn--busy` (12 استخدامًا ✓) + `shop-cart__item--busy` ✓ + `aria-busy` ✓.
- التغذية الراجعة: `toast()` ⇒ `#shop-toasts` + `toast--leaving` ✓ · عدّاد السلة في الهيدر (`.shop-cartbtn` + `.badge` ✓).
- الزائر ⇒ مودال المصادقة (لا طلب سلة ✓ — مقيس: 0 طلبات ✓).
- **يعتمد على DOM:** `#shop-toasts` · `.badge` · `.shop-cart__item--busy` · `.btn--busy` · `.modal__foot .btn`.
- **لا يُعدَّل** ✗.

---

## 10. SEARCH CONTRACT

- الفتح/الإغلاق: `.shop-search-sheet.is-open` + `is-opening`/`is-closing` + قفل تمرير (`documentElement.style.overflow` + `body.style.overflow` ✓) · إغلاق بـ`Escape`/زر الإغلاق/الخلفية ✓.
- الإدخال: debounce (`setTimeout(..., DEBOUNCE_MS)` ✓) ⇒ `GET /products?search=` ✓ · نتائج في `#shop-search-results` · اقتراحات في `#shop-search-suggest-list` ✓ · تفريغ `#shop-search-clear` ✓.
- الحالات: نتائج/فراغ/خطأ ✓ · إعلان `role=status` مقيّد ✓ (3G ✓).
- تركيز: يُعاد إلى الحقل بعد 60ms ✓ + `finish` بعد 240ms (مرتبط بمدة انتقال CSS ✗ — **يجب الحفاظ على التوقيت أو ربطه بتوكن مدة** ✓).
- **يعتمد على DOM:** `#shop-search-*` (8 معرّفات ✓) + `.shop-search-row*`.
- **ما يمكن استبداله:** كل الشكل البصري للّوحة/الصفوف ✓ · **ما يجب أن يبقى:** السلوك + المعرّفات + الإعلانات.

---

## 11. FILTER CONTRACT (مؤكَّد بالقياس)

| الفلتر | مدعوم؟ | ملاحظة |
|---|---|---|
| `search` | ✓ | server-side |
| `categoryId` | ✓ | server-side |
| `brandId` | ✓ | server-side |
| `sortBy`+`sortOrder` | ✓ | `createdAt·price·name` × `asc·desc` |
| `minPrice`/`maxPrice` | ✓ | server-side (3C: 400⇒1/1 · 99999⇒0/0 ✓) |
| `offers` | ✓ | **محلي على الصفحة المحمّلة فقط** ✓ |
| `inStock` | ✗ | **لا دعم صادق في القائمة** ⇒ التحكّم **محذوف من الواجهة** (0 مرئي/0 قابل للتركيز ✓) — `?inStock=1` لا يكسر ✓ |
| `page`/`limit` | ✓ | ترقيم موجود (`.pagination__btn` + `pagination__info` ✓) — **غير مُختبر ببيانات حقيقية** (منتجان فقط ✗) |
| `isFeatured`/`includeInventory` | ✓ | ضمن القائمة المسموحة ✓ |

**يعتمد على DOM:** `#shop-filters` · `#shop-filters-toggle` · `#shop-toolbar` · `#shop-filter-{search,category,brand,sort,minprice,maxprice,offers}` · `.shop-filters__sheet` · `aria-expanded`/`aria-controls` ✓.

---

## 12. PRODUCT DETAIL CONTRACT

- `GET /products/:id` ⇒ **`inStock` صادق** ✓: `false` ⇒ زر **معطّل أصلي** بنص «غير متوفر حاليًا» (بلا مصادقة/بلا طلب ✓) · `true` أو غير معرّف ⇒ السلوك الحالي ✓.
- معرض: `images[]`/`primaryImage` · بديل عند غياب/كسر الصورة ✓ · مصغّرات `aria-pressed` ✓ · `object-fit: contain` ✓.
- الكمية: `#shop-qty` + `.shop-qty__btn` (44px ✓).
- الوصف: `description` ⇒ fallback إلى `shortDescription` ✓ · المواصفات `specifications[]` (لوحة) ✓.
- المشابهة: `GET /products?categoryId=` ⇒ نفس بطاقة القوائم ✓ + **حالة خطأ مصغّرة** (`.shop-section--related-error` + `role=status` ✓).
- المسار: `crumbs` + `aria-current` على الأخير ✓.
- الحالات: loading (skeleton + `aria-busy`) · not-found (`role=status`) · error (`role=alert` + إعادة محاولة 44px) ✓.

---

## 13. CUSTOMER / ACCOUNT SURFACES

| السطح | المُصيّر | سلوك | API | يعتمد على DOM |
|---|---|---|---|---|
| Cart | `shop.cart-page.js` | زائر ⇒ مصادقة · مسجّل ⇒ عناصر/كميات | `GET/POST/PATCH /cart*` | `#shop-toasts` · `.shop-cart__item--busy` |
| Checkout | `shop.checkout-page.js` | معاينة + تأكيد | `POST /checkout/preview` · `POST /orders` | `#shop-checkout-error` |
| Account | `shop.account-page.js` | ملف + تغيير كلمة سر + جلسات | `GET/PATCH /users/me` · `/auth/*` | `core/session` |
| Orders/Order | `orders-page.js` · `order-page.js` · `order-flow.js` | قائمة + تفاصيل + إلغاء (سبب) | `GET /orders*` | `#shop-cancel-reason` · `#shop-cancel-error` |
| Payment | `payment-page.js` | شام كاش | `GET /payments/sham-cash/account` · `POST /payments` | — |
| Notifications | `notifications-page.js` | قائمة + غير مقروء + تفضيلات | `/notifications*` | `.shop-notif__head` · `.shop-notif--unread` |
| Verification | `verification-page.js` | بدء/إلغاء توثيق | `/verification/*` | — |

**لا أسطح مُختلقة** ✓ — كل ما سبق موجود في الكود ✓. **الدفع/الشحن/العمولة = غير محسومة** ⇒ لا تُصمَّم كوعود ✓.

---

## 14. THEME / DARK MODE CONTRACT

- **التخزين:** `localStorage[THEME_KEY]` (قيم: `light` · `dark` · `system` ✓).
- **التطبيق:** `document.documentElement.setAttribute('data-theme', mode)` ✓ + `data-theme-mode` على أزرار الاختيار ✓ + `classList` على الأزرار (`is-active` ✓).
- **التفضيل النظامي:** `system` مدعوم ✓ (الوضع الافتراضي عند غياب التخزين ✓).
- **المفتاح:** `.shop-menu__theme-btn` (3 أزرار: فاتح/داكن/نظام ✓).
- **التوكنز:** كل الألوان دلالية في `tokens.css` (`[data-theme='dark']` يعيد تعريفها ✓) ⇒ **إعادة التصميم تُبقي هذه الآلية كما هي** ✓ (Tailwind: `@custom-variant dark (&:where([data-theme="dark"] *))` ✓).

---

## 15. ACCESSIBILITY CONTRACT (ما يجب أن يبقى)

| السلوك | الحالة | يجب أن يبقى؟ |
|---|---|---|
| حصر التركيز في اللوحات/المودالات (ديناميكي ✓) | 20/20 ✓ (3G) | **نعم** |
| إرجاع التركيز للفاعل | ✓ | **نعم** |
| Escape يغلق | ✓ | **نعم** |
| `aria-expanded`/`aria-controls` على الفواتح | ✓ | **نعم** |
| `aria-modal` + `role=dialog` + `aria-labelledby` | ✓ | **نعم** |
| `aria-current` (مسار/تنقّل) | ✓ | **نعم** |
| `role=status` / `role=alert` / `aria-live` مقيّدة | ✓ | **نعم** |
| `aria-busy` على التحميل | ✓ | **نعم** |
| `disabled` أصلي (CTA غير متوفر) | ✓ | **نعم** |
| `.visually-hidden` + `skip-link` | ✓ | **نعم** |
| `prefers-reduced-motion` (شريط/سلايدر/انتقالات) | ✓ | **نعم** |
| حلقة تركيز مرئية ≥3:1 | ✓ (5.82–6.09 فاتح · 3.34–3.63 داكن) | **نعم** |
| أهداف لمس ≥44 | ✓ (استثناء موثّق: `modal__close` 34px ✗) | **نعم** |
| معرض لوحة المفاتيح + `aria-pressed` للمصغّرات | ✓ | **نعم** |
| تكبير النص 200% (بعد تحويل rem في 5B) | ✓ يعمل | **نعم** (يجب الحفاظ عليه في Tailwind ✓) |

---

## 16. LEGACY CSS DEPENDENCY CLASSIFICATION

**المنهج:** تصنيف آلي لـ**1,035 قاعدة** في ملفات المتجر (A عرضية · B استجابة · C سلوك/حالة · D إتاحة · F مرشّحة للموت) + تحقق من وجود كل صنف في JS/HTML.

| الملف | A عرضية | B استجابة | C سلوك | D إتاحة | F مرشّحة للموت | الإجمالي |
|---|---|---|---|---|---|---|
| `shop.css` | 148 | 325 | 37 | 21 | **39** | 570 |
| `shop.header.css` | 3 | 180 | 34 | 20 | 2 | 239 |
| `shop.home.css` | 23 | 55 | 18 | 5 | 2 | 103 |
| `shop.search.css` | 1 | 70 | 8 | 10 | 0 | 89 |
| `shop.filters.css` | 10 | 17 | 5 | 2 | 0 | 34 |
| **الإجمالي** | **185** | **647** | **102** | **58** | **43** | **1,035** |

**مرشّحات الموت (43 قاعدة · تحتاج تحققًا فرديًا قبل أي حذف):** أمثلة مؤكّدة: `.shop-hero*` (استُبدل بالسلايدر ✓) · `.shop-user__avatar` · `.shop-grid--dense` · `.shop-footer__admin` · `.shop-drawer__head` · `.shop-cartbtn__icon`/`.shop-bell__icon` (أيقونات موروثة ✓).

**قواعد يجب أن تبقى بشكل ما (ولو أُعيدت كتابتها):** كل `C` (102) + `D` (58) ⇒ أي: `visibility` للوحة المغلقة · `position/z-index` للطبقات · قفل التمرير · `:focus-visible` · `prefers-reduced-motion` · `.visually-hidden` · أصناف الحالة الأربعة عشر · `-webkit-line-clamp` للاسم · `overflow-wrap` للحالات القصوى.

**خطر مشترك ⚠️:** `tokens.css` + `base.css` + `components.css` تُستخدم **أيضًا في لوحة الإدارة** ⇒ لا يجوز حذف/تغيير توكنز أو مكوّنات مشتركة دون التحقق من الأدمن.

**بعد الترحيل يمكن تقاعد:** `shop.css` · `shop.header.css` · `shop.home.css` · `shop.search.css` · `shop.filters.css` (كاملة ✓) + ملفات Qomra woff2 الثلاثة ✓ — **لا** `tokens/base/components` ✗ (مشتركة).

---

## 17. CURRENT BUILD / DEPLOYMENT ARCHITECTURE

| الطبقة | الحالي |
|---|---|
| الواجهة | **بلا build** ✗ (لا `package.json` للواجهة ✓ · لا `node_modules` ✓) — ملفات CSS/JS تُقدَّم كما هي |
| الاستضافة | nginx 1.28: `/alwled/shop/` (ثابت) · `/alwled/admin/` → python static على 5173 · `/alwled-api/` → NestJS على 3100 |
| النشر | نسخ ملفات + (للـAPI) `npm run build` + `systemctl restart alwled-api` |
| gzip | **مفعّل** ✓ (`comp_level 6`) · brotli ✗ |
| الكاش | **`Cache-Control: no-store` على كل الأصول** ✗✗ (من `sites-enabled/panel:7`) |
| أدوات متاحة | node **22.23.2** ✓ · npm 12 ✓ · python 3.11.15 ✓ · **القرص 94% ممتلئ** ✗ (3.1 GB) |

---

## 18. TAILWIND INTEGRATION RECOMMENDATION

**المعمارية المقترحة (إنتاجية · بلا CDN ✗):**

1. **الإصدار:** **Tailwind v4** (CSS-first: `@theme` · بلا `tailwind.config.js` ✗) — مناسبة لمشروع بلا JS bundler ✓؛ البديل المحافظ: v3.4 مع `tailwind.config.js` (لو أردنا توافقًا أوسع مع المكوّنات القديمة ✓).
2. **البناء:** `@tailwindcss/cli` كـ**devDependency** في `frontend/` (ملف `package.json` جديد للواجهة ✓) + سكربتات: `tw:build` (minify ✓) و`tw:watch` (تطوير ✓).
3. **المدخل:** `frontend/shop/assets/tw/input.css` = `@import "tailwindcss"` + `@theme` (توكنزنا ✓) + `@layer components` لمكوّناتنا الدلالية ✓ + `@custom-variant dark` ✓.
4. **المخرج:** `frontend/shop/assets/css/shop.tw.css` (ملف واحد مضغوط ✓) — **يُولَّد على السيرفر ويُقدَّم كملف ثابت** ✓ (لا بناء وقت الطلب ✓).
5. **المسح (content):** `shop/**/*.{html,js}` + `assets/js/**/*.js` ✓ — **إلزامي** لأن الـDOM مُولَّد من JS ✓ (المسح على الـHTML وحده سيفشل ✗ — أُثبت بالتجربة: 1.9 KB بلا أي صنف ✓).
6. **RTL:** خصائص منطقية (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`/`text-start`) ✓ + `dir="rtl"` على `<html>` ✓ (بلا plugin ✗).
7. **الداكن:** `@custom-variant dark (&:where([data-theme="dark"] *))` ✓ ⇒ **يبقي آلية الثيم الحالية كما هي** ✓.
8. **التصغير:** `--minify` ✓ · **الكاش:** اسم مُبصَّم (`shop.tw.<hash>.css` ✓) + `Cache-Control: public, max-age=31536000, immutable` ✓ (يحل مشكلة `no-store` الحالية ✓✓).
9. **التبعيات التنموية المطلوبة:** `tailwindcss` + `@tailwindcss/cli` (حزمتان ✓ · ~15–25 MB ✓) — **تُثبَّت على السيرفر فقط للبناء** ✓؛ لا تُشحن للمتصفح ✓.
10. **مخاطر:** القرص 94% ✗ (يجب مراقبته ✓) · يجب `.gitignore` لـ`node_modules` ✓ · المخرج **يُولَّد ويُخزَّن** (وإلا كسر النشر ✓).

---

## 19. FILES/TOOLING THAT WOULD BE REQUIRED (Phase 1)

```
frontend/package.json                     ← جديد (devDeps + سكربتات) [لا يوجد حاليًا]
frontend/tailwind/input.css               ← جديد (Tailwind + @theme + @layer components)
frontend/shop/assets/css/shop.tw.css      ← مُولَّد (يُخزَّن في المستودع/السيرفر)
frontend/tailwind/README.md               ← توثيق أمر البناء
frontend/shop/index.html                  ← يُعاد كتابته (هيكل + تحميل shop.tw.css)
frontend/shop/assets/js/**                ← تُحدَّث تدريجيًا (أصناف جديدة فقط — بلا تغيير منطق)
```
**لا يتغيّر:** `assets/css/tokens.css` (إضافة `@theme` مرآة فقط) · `assets/js/core/*` ✗ · `layout.css` ✗ (للأدمن) · backend/API/DB ✗.

---

## 20. CAIRO / QOMRA AUDIT (مقيس)

| السؤال | الجواب |
|---|---|
| هل Cairo مُضمَّن محليًا؟ | **نعم** ✓ — `assets/fonts/Cairo-Regular.ttf` (585.5 KB) عبر `@font-face` في `base.css` (`font-weight: 400 700` · `font-display: swap`) |
| أم محمّل خارجيًا؟ | **لا** ✗ — لا CDN ولا Google Fonts ✓ (مقيس: 45 طلبًا · **نطاق واحد** · **طلب خط واحد فقط** = الملف المحلي ✓) |
| أم مجرد fallback في السلّم؟ | كان كذلك قبل 5B ✗ (`Tahoma, Cairo, …`) ⇒ **الآن Cairo أولًا** ✓ على `.shop-body` ✓ |
| هل هو مضمون لكل زائر؟ | **نعم** ✓ (ملف محلي ✓) — مقيس: `document.fonts` = `Cairo/400 700/loaded` + عرض النص = عرض السلّم المُعلن ✓ |
| Qomra | **0 مرجع في واجهة المتجر** ✓ (7 → 0 في 5B ✓ · لا طلب شبكة ✓) · 3 ملفات woff2 (78 KB) بلا استخدام ⇒ **مرشّحة للتقاعد** ✓ |
| ملاحظة حقيقية | ملف TTF واحد يغطّي 400–700 ⇒ الأوزان 500/600 قد **تُصنَّع** ✗ |
| تحسين مقيس | TTF → WOFF2: **164.7 KB (−72%)** · مُجزَّأ (عربي+لاتيني): **113.8 KB (−81%)** ✓ (أدوات `pyftsubset` + `brotli` موجودة على السيرفر ✓) |

---

## 21. FUTURE DESIGN-TOKEN MAPPING (Tailwind `@theme`)

| الدلالة | التوكن الحالي | في Tailwind |
|---|---|---|
| primary | `--store-primary` `#1F5FBF` | `--color-primary` ⇒ `bg-primary` |
| primary-hover | `#1A54A8` | `--color-primary-hover` |
| primary-active | `#164A93` | `--color-primary-active` |
| primary-soft | `#EAF1FB` (داكن `rgba(31,95,191,.18)`) | `--color-primary-soft` |
| bg / surface / elevated | `--store-bg` · `--store-surface` · `--bg-surface-2` | `--color-bg` · `--color-surface` · `--color-elevated` |
| text / muted | `--store-text` · `--store-text-muted` | `--color-ink` · `--color-ink-muted` |
| border / strong | `--store-border` · `--border-strong` | `--color-line` · `--color-line-strong` |
| danger/success/warning/info | `--store-danger/success/warning/info` | كما هي (تُستخدم كحالات فقط ✓) |
| focus | `--store-primary` / `#2563EB` (داكن) | `--color-focus` + `outline` موحّد |
| radius | 8 · 10 · 14 · 20 · 999 | `--radius-sm/md/lg/xl/pill` |
| shadow | `--shadow-xs/sm/md/lg` + focus | `--shadow-*` (4 فقط ✓) |
| container | 1200px | `--container-store: 1200px` ⇒ `max-w-store` |
| spacing | 2·4·6·8·12·16·20·24·32·40·48 | سلّم Tailwind الافتراضي + 2 قيم مخصّصة |
| typography | أدوار `--st-*` (rem ✓) | `--text-*` + `--leading-*` (Cairo) |

**القاعدة:** توكنز **دلالية** فقط ⇒ الداكن يعمل تلقائيًا ✓ · **لا مئات التوكنز** ✓ (~35 توكنًا ✓) · لا مساس بـ`--store-*` (الأدمن يعتمد عليها ⚠️).

---

## 22. FUTURE COMPONENT INVENTORY (خريطة معمارية فقط)

`AppShell` · `SkipLink` · `Header` (DesktopNav · MobileTopBar · Burger) · `MobileNav/Drawer` · `ThemeSwitch` · `SearchSheet` (+Input · Results · Suggestion · Empty) · `HomeTicker` · `HeroSlider` (+Arrows · Dots) · `SectionHeader` (+Link) · `BenefitStrip` · `CategoryCard` · `BrandCard` · `ProductGrid` · `ProductCard` (+Media · Meta · Title · PriceBlock · Badge · AddButton) · `TaxonomyGrid` · `FilterToolbar` · `FilterSheet` (+Dialog semantics) · `FilterField` (Text · Select · Check · Range) · `ActiveFilters` · `ResultCount` · `Pagination` · `Breadcrumb` · `ProductGallery` (+Stage · Thumbs) · `PurchasePanel` (+Price · Availability · Qty · CTA) · `ProductFacts` · `ProductInfo` (+Prose · Specs) · `RelatedProducts` (+ErrorState) · `CartItem` (+Qty · Remove) · `CartSummary` · `CheckoutPreview` · `OrderCard` · `OrderTimeline` · `PaymentPanel` · `NotificationItem` · `VerificationPanel` · `AuthDialog` (+3 actions) · `Toast` · `Skeleton` · `EmptyState` · `ErrorState` · `Footer` (+Accordion).

---

## 23. NEW RESPONSIVE STRATEGY

**مبدأ:** mobile-first ✓ · **5 نقاط كسر فقط** (افتراضي Tailwind ✓ + لا نقاط مخصّصة إلا عند ضرورة مُثبتة):
`base` (360–639) · `sm:640` · `md:768` · `lg:1024` · `xl:1280` · `2xl:1536`.

| العرض | ما يتغيّر بنيويًا |
|---|---|
| 360–430 | عمود واحد · هيدر مضغوط (شعار + أيقونات + برغر) · شبكة منتجات **عمودان** · فلاتر كلوحة سفلية · أزرار بعرض كامل · أهداف ≥44 |
| 600 | بطاقات أوسع · شريط تصنيفات صفّان |
| 640–767 | شبكة 2–3 أعمدة · هيدر أوسع |
| 768–1023 | شبكة 3 أعمدة · لوحة الفلاتر ما زالت مودالية · PDP عمود واحد |
| 1024–1279 | هيدر مكتبي كامل + بحث inline · شريط فلاتر inline · PDP عمودان |
| 1280–1535 | شبكة 4 أعمدة · حاوية 1200 كاملة |
| 1536+ | نفس التخطيط مع هوامش أوسع (لا تمدّد لانهائي ✓) |

**قواعد إلزامية:** لا «تصغير ديسكتوب» ✗ · الشريط السفلي/الـCTA في متناول الإبهام ✓ · لا فائض أفقي في أي عرض (بوابة قياس ✓) · اختبر 600/768/769/1023/1024 كعروض انتقال ✓.

---

## 24. NEW VISUAL DIRECTION (بلا تنفيذ)

**الهدف:** تجزئة أجهزة منزلية **modern premium** — ثقة، وضوح، صورة المنتج أولًا.
- **أسطح:** بيضاء/رمادية-باردة فاتحة (`#F8FAFC`) + بطاقات بيضاء · **الحدّ 1px هو أداة الفصل الأولى** ✓ · ظلال فقط للطبقات (drawer/modal/toast) والتركيز.
- **الشبكة:** حاوية 1200 · شبكة منتجات 2/3/4 · فجوات 12–24.
- **البطاقة:** صورة أولًا (نسبة ثابتة 1:1 أو 4:5 ✓ `object-fit: contain` ✓) · اسم سطران · سعر بارز · شارة خصم واحدة · زر واضح بعرض كامل على الجوال.
- **الطباعة:** Cairo بأدوار دلالية (`--st-*` ✓) — سعر أعلى من الاسم ✓، وميتا 12px لا 13 ✗ · **بلا letter-spacing على العربية** ✗.
- **الحركة:** 150–220ms · بلا زخرفة ✗ · احترام `prefers-reduced-motion` ✓.
- **ممنوع:** لوحة تحكم/SaaS · glassmorphism · تدرّجات كثيفة · استدارة مفرطة · هيرو فارغ ضخم · نص صغير · ضجيج بصري · إلحاح/ندرة/عدّادات وهمية ✗.
- **حقول ممنوعة:** لا صور/ماركات/أوصاف مُختلقة ✗ (blocker: نحتاج بيانات حقيقية ✓).

---

## 25. MIGRATION / COEXISTENCE STRATEGY

**الاستراتيجية الموصى بها: مسار متوازٍ كامل (لا خلط CSS).**
1. بناء جديد في `frontend/shop/` **بأسماء ملفات جديدة** (`shop.tw.css` + `index.new.html`? ✗) — الأفضل: **نشر مسار تجريبي** `/alwled/shop-new/` (نسخة من `shop/` ✓) مع nginx location جديد ✓ ⇒ **الصفحتان تعملان جنبًا إلى جنب** للـQA ✓ · **صفر حرب أولويات** ✓ (لا يُحمَّل CSS القديم مع الجديد أبدًا ✓) · **rollback فوري** ✓ (نقطة nginx واحدة ✓).
2. الـJS **يُعاد استخدامه كما هو** ما أمكن ✓ (المنطق لا يُلمس ✗) — التغيير في الطبقة المولِّدة للـDOM (أصناف + بنية) فقط ✓.
3. **عقد اختبار DOM** (Playwright) يُشغَّل على المسارين ✓: 26 ID · 14 صنف حالة · 14 سلوك إتاحة · 13 مسار · 29 نداء API ⇒ أي كسر يُكتشف فورًا ✓✓.
4. **ممنوع:** `!important` ✗ · طبقات تجاوز ضخمة ✗ · تحميل CSS القديم في الصفحة الجديدة ✗.
5. **FOUC:** `shop.tw.css` يُحمَّل في `<head>` ✓ + `data-theme` يُطبَّق قبل الرسم (سكربت صغير inline ✓ — موجود أصلًا في `shop.app.js` ⇒ يُنقل إلى `<head>` ✓).
6. كل مكوّن يصبح **مستقلًا** عن CSS القديم حين: (أ) كل محدداته تُولَّد من Tailwind ✓ (ب) لا قاعدة قديمة تُطابقه ✓ (ج) العقد محفوظ ✓.

---

## 26. PROPOSED REBUILD PHASES

| المرحلة | النطاق | الملفات | الاعتماد السلوكي | خطر | بوابة QA | CSS يُتقاعد |
|---|---|---|---|---|---|---|
| **1 · Foundation** | Tailwind + Cairo + توكنز + App shell + عقد اختبار | `package.json` · `tailwind/input.css` · `shop.tw.css` · `index.html` | `data-theme` + `data-api-base` + `#shop-view` + `#shop-toasts` | منخفض | بناء ناجح · CSS ≤ 30 KB gzip · 0 فائض · 13 مسارًا تعمل | لا |
| **2 · Header + Nav + Search** | هيدر/دُرج/بحث + الثيم | `shop.header.js` (أصناف) · `shop.search.js` | 12 ID + قفل تمرير + debounce 240ms + `aria-expanded` | **متوسط–مرتفع** | عقد DOM كامل + لوحة المفاتيح + Escape/إرجاع تركيز | `shop.header.css` · `shop.search.css` |
| **3 · Home** | شريط + سلايدر + أقسام | `shop.pages.js` (home) | الشريط (نسخ + حركة) + السلايدر (توقيت) | متوسط | 200% + reduced-motion + لا فراغ | `shop.home.css` |
| **4 · Catalog + Filters + Taxonomy** | شبكة/بطاقات/شريط/لوحة | `shop.pages.js` · `shop.js` (productCard) | 8 ID + `filterA11y` + `inStock` مخفي | **مرتفع** | الفلاتر الثمانية + الترقيم + 768↔769 | `shop.filters.css` + أجزاء من `shop.css` |
| **5 · PDP** | معرض + شراء + مشابهة | `shop.pages.js` (product) | `inStock` الصادق + `disabled` + الكمية | متوسط | 632 (متاح) + 633 (غير متاح) + مشابهة/خطأها | أجزاء من `shop.css` |
| **6 · Cart + Auth + أسطح الزبون** | سلة/دفع/حساب/طلبات/إشعارات/توثيق | 8 ملفات JS | 3 ID + `btn--busy` + توست + مودال | **مرتفع** | زائر/مسجّل + كل الحالات | بقية `shop.css` |
| **7 · Dark + Responsive + A11y + Perf** | QA شامل | — (قياس) | كل ما سبق | — | 13 عرضًا × ثيمين × 200% + الكاش + WOFF2 | — |
| **8 · Legacy retirement** | حذف القديم | 5 ملفات CSS + 3 خطوط Qomra | تحقق 8 نقاط ✓ | متوسط | لا مرجع متبقٍّ + QA كامل | **الكل** |

**تعديل موصى به على تسلسلك:** أضفتُ **عقد اختبار DOM في المرحلة 1** ✓ (بدونه تصبح كل مرحلة لاحقة مخاطرة عمياء ✓).

---

## 27. PER-PHASE RISK MAP (أعلى 6 مخاطر)

| # | الخطر | الأثر | التخفيف |
|---|---|---|---|
| 1 | **كسر عقد DOM** (26 ID / 14 صنف حالة) | وظائف ميتة (سلة/فلاتر/بحث) | عقد اختبار Playwright في Phase 1 + تشغيله في كل بوابة |
| 2 | **تعديل توكنز مشتركة** | كسر لوحة الإدارة | توكنز جديدة فقط (`--tw-*`/`@theme`) + عدم لمس `--store-*` |
| 3 | **توقيت JS↔CSS** (240ms/60ms/الشريط/السلايدر) | حركات مقطوعة أو حالات عالقة | توكن مدة موحّد + `transitionend` بدل أرقام صريحة |
| 4 | **البناء على السيرفر + القرص 94%** | فشل build/نشر | تثبيت مرة واحدة + `.gitignore` + مراقبة df + تنظيف `/tmp` |
| 5 | **حذف CSS مبكرًا** | انحدار في ثيم/عرض | سياسة التقاعد 8 نقاط (بند 28) + التقاعد في Phase 8 فقط |
| 6 | **غياب بيانات حقيقية** (منتجان بلا صور/وصف) | تصميم «product-first» غير قابل للتحقق | توفير صور/أوصاف/منتجات حقيقية قبل Phase 3 |

---

## 28. LEGACY CSS RETIREMENT STRATEGY (سياسة مستقبلية)

**لا يُحذف شيء لأنه قديم** ✗. قاعدة الإزالة (8 شروط):
1. البديل موجود ويعمل ✓ 2. كل المستهلكين معروفون ✓ 3. الاعتماد السلوكي = صفر أو مُرحَّل ✓ 4. QA الاستجابة ينجح (13 عرضًا ✓) 5. الفاتح/الداكن ينجح ✓ 6. لوحة المفاتيح/الإتاحة تنجح ✓ 7. لا محدّد وقت-تشغيل يعتمد عليه (فحص `querySelector`/`closest`/`classList` ✓) 8. لا مستهلك مشترك خارج المتجر (الأدمن ⚠️).
**+ تحقق آلي:** سكربت يفحص كل صنف في CSS مقابل JS/HTML (كما في بند 16 ✓ — 43 مرشّحًا للموت ✓) + قياس انحدار كامل قبل/بعد الحذف ✓.

---

## 29. BLOCKERS / UNKNOWNS (تحتاج قرارًا منك)

1. **بيانات حقيقية:** منتجان تجريبيان بلا **صور** ولا **أوصاف** ولا **مواصفات** ✗ ⇒ تصميم premium لا يمكن التحقق منه بصريًا. **قرار مطلوب:** توفير صور/أوصاف حقيقية قبل Phase 3؟
2. **الترقيم:** موجود في الكود ✓ لكن غير قابل للاختبار (منتجان ✓) ⇒ هل نُبقيه كما هو بلا تصميم مخصّص الآن؟
3. **مصدر رسائل الشريط:** حاليًا **مكتوبة في JS** ✗ (4 رسائل) ⇒ هل تبقى كذلك أم تُصبح إعدادًا من الأدمن/API؟
4. **الدفع/الشحن/العمولة:** غير محسومة ✗ ⇒ لا تُصمَّم كوعود (نفس سياسة 4B ✓).
5. **`modal__close` = 34px** ✗ (هدف لمس) ⇒ أُصلح في إعادة التصميم؟
6. **القرص 94%** ✗ + **`NODE_ENV=development`** ✗ على الـAPI ⇒ هل نصلحهما ضمن Phase 7 (أداء)؟
7. **مسار الترحيل:** `/alwled/shop-new/` للتجربة جنبًا إلى جنب — موافقة؟
8. **Tailwind v4 مقابل v3.4** — تفضيل؟ (توصيتي: **v4** ✓).

---

## 30. CONFIRMATION

```
SOURCE FILES MODIFIED = 0
DEPENDENCIES INSTALLED = 0
TAILWIND INSTALLED = NO
FONT INSTALLED = NO
BACKEND MODIFIED = 0
API MODIFIED = 0
DB MODIFIED = 0
ROUTES MODIFIED = 0
```
**الأدلة:** لقطة `md5-phase0.txt` (27 ملفًا: CSS المتجر + المشترك + `index.html` + كل JS المتجر) · `find -newermt` ⇒ لا ملف مصدر عُدّل خلال Phase 0 ✓ (آخر تعديل مصدر كان مهمة الشريط @08:04 قبل البدء ✓) · `ls` ⇒ لا `package.json`/`node_modules` للواجهة ✓ · سجل الشبكة ⇒ لا طلب خط جديد ✓.
**ملفات أُضيفت (تدقيق فقط):** `tools/qa/stage0/{extract_contract,classify_css}.py` + `md5-phase0.txt`.

---

SOURCE FILES MODIFIED = 0
DEPENDENCIES INSTALLED = 0
TAILWIND INSTALLED = NO
FONT INSTALLED = NO

PHASE 0 REBUILD AUDIT COMPLETE.
NO IMPLEMENTATION PERFORMED.
AWAITING APPROVAL FOR NEW STOREFRONT FOUNDATION.
