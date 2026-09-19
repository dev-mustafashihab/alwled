# PHASE 3 — STEP 5 · PRE-FLIGHT AUDIT (Storefront Slider)

**النطاق:** المتجر فقط (`/root/alwled/frontend/shop`) · **لا تعديل على Admin/Backend/API/DB/Schema/Storage/nginx** ✗
**الحالة:** التدقيق **مكتمل** ✓ — لم يُكتب أي كود بعد ✗ (الخطوة التالية: 5.1)

---

## 1) الملف/الدالة التي ترسم Home

| البند | القيمة |
|---|---|
| الملف | `shop/assets/js/shop.pages.js` (1,228 سطرًا · 61.5KB) |
| الدالة | **`home(view)`** — السطر **59** |
| النمط | `shop.clear(view)` ثم `shop.loadingBlock(...)` ثم `Promise.all([...])` ثم البناء |
| التحميل المتوازي | `shop.api.products({limit:24,sortBy:'createdAt',sortOrder:'desc'})` + `products({isFeatured:true,limit:8})` + `categories()` + `brands()` — **كلها مع `.catch` آمن** ✓ |
| الرسم | `view.appendChild(homeTicker([...]))` (**س84**) · `view.appendChild(homeSlider([...]))` (**س92**) |
| الأخطاء | `errorBlock(error, retry)` عند السطر 185 ✓ |

## 2) Hero الحالي

- **لا يوجد Hero مستقل يُرسم حاليًا** ✓ — `home()` يُلحق **الشريط الإعلاني** (`homeTicker`) ثم **السلايدر القديم** (`homeSlider`) في موضع الـHero ✓.
- CSS الـHero القديم **ما زال موجودًا** ✓ في `shop.css` (`.shop-hero*` — س378–443 · س1038 · س1090 · س1789–1824) ✗ **غير مستخدم في الرسم الحالي** ✓ ⇒ **لا يُحذف الآن** ✗ (Phase 8 للتنظيف ✓).

## 3) DOM IDs/classes/hooks المرتبطة

**السلايدر القديم (سيُعاد استخدام الهيكل ✓):**
- `#shop-home-slider` (section) ✓ · `.shop-home-slider__viewport` · `__track` · `__dots` · `__arrow--prev/--next` · `.shop-home-slide` (`data-index`) · `.shop-home-slide--1|2|3` · `__shapes` · `__body` · `__title` · `__text` · `__cta` · `#shop-home-slide-cta-N`
- **ARIA قائمة ✓:** `aria-label="أبرز العروض"` · `aria-roledescription="عرض شرائح"` · الشرائح `role="group"` + `aria-roledescription="شريحة"` + `aria-label="N من M"` · النقاط `role="tab"` + `aria-selected` · الأسهم بأسماء عربية ✓
- **الشريط (سيبقى مخفيًا ✓):** `#shop-home-ticker` + `.shop-home-ticker__*` (أُخفي سابقًا ✓ — النصوص محفوظة في `tools/qa/foundation/TICKER-MESSAGES-PRESERVED.md` ✓)

## 4) CSS القديم المرتبط

`shop/assets/css/shop.home.css` (19.7KB) ✓ — القواعد: س14–15 · س72–137 (السلايدر القديم ✓) — يشمل **تدرّجات لونية زخرفية** ✗ (`.shop-home-slide--2/3 { background-image: linear-gradient(...) }` س96–97 ✓) و`.shop-home-slide__shapes` ✗.
⇒ **سيُستبدل السلوك البصري بقواعد جديدة بادئة `stw-`** ✓ (Tailwind layer ✓) مع **إبقاء الملف** ✗ (لا حذف جماعي ✗).

## 5) المؤقّتات والمستمعات الحالية

| العنصر | الحالة |
|---|---|
| **المؤقّت** | **`homeSliderTimer` واحد على مستوى الوحدة** ✓ (س202) — `setInterval(..., **5500ms**)` ✓ |
| تنظيف | `stop()` (س298) يُنفّذ `clearInterval` + تصفير ✓ — ويُنادى في `start()` ✓ + **إيقاف ذاتي** إذا خرج `root` من DOM (س307) ✓✓ |
| كشف الحركة المخفّضة | `matchMedia('(prefers-reduced-motion: reduce)')` ⇒ **لا autoplay** ✓ |
| pause | `paused` عند `touchstart` ✓ · يُعاد عند `touchend` ✓ |
| swipe | عتبة **40px** ✓ + اتجاه **واعٍ بـRTL** ✓ (`dx<0 ⇒ index+1`) ✓ |
| نقاط/أسهم | `click` لكل نقطة ✓ + `prev/next` ✓ (تغيير مباشر بلا إعادة تصفير المؤقّت ✗ ⇒ فرصة تحسين في 5.3 ✓) |

## 6) Lifecycle في SPA

- `home(view)` **يُبنى من جديد** عند كل دخول ✓ (`shop.clear(view)` ✓) ⇒ العناصر السابقة تُفقد ✓ والمؤقّت **يوقف نفسه** عند غياب `root` من DOM ✓ (س307) ✓.
- **مخاطرة مرصودة ✓:** لا يوجد `clearInterval` صريح عند **مغادرة المسار** ✗ (الاعتماد على الإيقاف الذاتي عند أول نبضة تالية ✓ ≈≤5.5s ✗) ⇒ **يجب** إضافة تنظيف صريح في 5.4 ✓ (وفق معمارية lifecycle القائمة ✓ — بلا كسرها ✗).
- **Race safety:** `home()` يعمل `Promise.all` ✓ — إن غادر المستخدم قبل الحلّ ✗ فالكتابة ستقع على `view` قديمة ✗ ⇒ **يجب فحص `document.body.contains(view)`** قبل الرسم ✓ (كما يفعل السلايدر القديم مع `root` ✓).

## 7) API abstraction المستخدمة في المتجر

`shop.api.*` ✓ (في `shop.js` س328+) — كلها **`ALW.api.get(...)`** ✓ ⇒ **السلايدر الجديد سيستخدم `shop.api`** ✓ بإضافة **`slider()` ⇒ `ALW.api.get('/slider')`** ✓ (Public ✓ بلا auth ✓ بلا Admin endpoint ✗).
⚠️ **مهم:** `ALW.api.get` **يفكّ غلاف `{success,message,data}` ويعيد `data` مباشرة** ✓ (درس STEP 4 ✓) ⇒ يجب التعامل مع **المصفوفة المباشرة** ✓ مع دعم `{data:[...]}` احتياطًا ✓.

## 8) Tailwind / stw architecture

- البناء: `frontend/tailwind/input.css` ⇒ (CLI `--minify`) ⇒ `shop/assets/css/shop.tw.css` (45.9KB ✓) ✓ — **Tailwind v4.3.3 محلي ✓ بلا CDN ✗**
- الطبقات: كل القواعد `unlayered .stw` ✓ · توكنز دلالية ✓ · خط **Cairo WOFF2 محلي** ✓
- البراند: `#FFBF17` / hover `#E9AA00` / active `#D39900` / ink `#171717` ✓ — **الأصفر accent فقط ✗ لا سلايدر أصفر بالكامل ✗**
- ملفات CSS الأخرى: `shop.css` (83.5KB) · `shop.header.css` (52.3KB) · `shop.home.css` (19.7KB) · `shop.search.css` · `shop.filters.css` ✓

## 9) الاختبارات/العقود المرتبطة بالـHome

| المجموعة | الأثر المتوقّع |
|---|---|
| `contract.py` (Phase 1 — 58 فحصًا) | **لا يختبر الـHero ولا السلايدر ولا الشريط** ✓ (بحث نصي = صفر نتائج ✓) ⇒ **لا كسر متوقّع** ✓ |
| `contract_p2.py` (Phase 2 — 26) | يخصّ الهيدر/التنقّل/البحث ✓ — **السلايدر تحته مباشرة** ✓ ⇒ **يجب إعادة تشغيله** ✓ (فحوص الارتفاع/التقارب ✓) |
| `contract_motion.py` (9) | الحركات ✓ ⇒ تُعاد ✓ |
| `verify_quicknav.py` (18) | الشريط السريع ✓ — **الجار الأعلى للسلايدر** ✓ ⇒ تُعاد ✓ |
| `verify_mobile_header.py` (92) | الهيدر ✓ ⇒ تُعاد ✓ (تحقّق عدم تأثّر) |

---

## خطة التنفيذ (5.1 → 5.5)

| الخطوة | العمل | الملفات |
|---|---|---|
| **5.1** | إضافة `shop.api.slider()` ✓ · جلب `GET /slider` مع `.catch(()=>[])` ✓ · استبدال **بيانات `homeSlider([...])` المُختلقة** ✗ ببيانات الـAPI ✓ · 0 شرائح ⇒ **لا render للقسم** ✓ · 1 شريحة ⇒ **بلا أسهم/نقاط/autoplay** ✓ · فشل API ⇒ القسم يختفي والصفحة تكمل ✓ · `eager`+`fetchpriority=high` للأولى و`lazy` للبقية ✓ · fallback `mobileImageUrl ?? desktopImageUrl` ✓ | `shop.js` · `shop.pages.js` |
| **5.2** | بناء البطاقة على **الصورة** ✓ (`<picture>` عند وجود mobileImageUrl ✓ · `width:100%; height:auto; object-fit:contain` ✓ **بلا crop/stretch** ✗) · overlay **فقط عند وجود title/subtitle/cta** ✓ · قواعد `stw-` جديدة ✓ (بلا glassmorphism/gradients/ظلال ثقيلة ✗) · أحمر: لا يعمل على الصورة ✓ | `shop.pages.js` · `tailwind/input.css` ⇒ build |
| **5.3** | carousel عند `>1` فقط ✓ · autoplay 5500ms مع **إعادة تصفير عند التنقّل اليدوي** ✓ · pause على hover/focus/interaction ✓ · كشف الحركة المخفّضة ✓ · dots/arrows RTL ✓ · swipe بعتبة ✓ | `shop.pages.js` |
| **5.4** | **تنظيف صريح للمؤقّت والمستمعات عند مغادرة Home** ✓ · فحص `contains(view)` قبل الرسم (race ✓) · semantics ✓ · بلا `aria-live` مزعج ✗ · hidden slides بلا tabbable ✗ · روابط semantic ✓ (بلا `<a>` داخل `<a>` ✗) | `shop.pages.js` |
| **5.5** | مصفوفة QA النهائية + اللقطات + الانحدار + تشغيل العقود ✓ | `tools/qa/**` |

## قيود يجب احترامها
- **لا حذف Legacy CSS بالجملة** ✗ (Phase 8 ✓) — إبقاء `.shop-hero*` و`.shop-home-slide--*` كما هي ✓
- **لا بيانات وهمية** ✗ (لا عنوان/CTA افتراضي ✗) · `alt` من API ✓
- **لا تغيير في عقد الـAPI أو الـAdmin** ✗
- **viewport** غير قابل للتحكم في هذه الأداة ✗ ⇒ سيُسجَّل TOOLING LIMITATION بصدق ✓
