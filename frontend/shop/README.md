# alwled — متجر الزوار (Public Store)

واجهة متجر عامة للزوار على المسار **`/alwled/shop/`**، مستقلة تمامًا عن لوحة الإدارة
في الملفات والتخطيط والتوجيه، وتتشارك معها **نفس الـAPI المركزي** و**نفس Design Tokens**.

## 1) القيود المعمارية (Stage 14.1)

- **HTML5 + CSS3 + Vanilla JS** — بلا Framework، بلا CDN، بلا خطوة Build، بلا npm للواجهة.
- كل الملفات محلية: لا خطوط خارجية، لا صور من الإنترنت، لا مكتبات طرف ثالث.
- **الزائر يتصفّح بلا تسجيل**: الرئيسية، المنتجات، التصنيفات، العلامات، البحث، تفاصيل المنتج.
- **لا تدفق سلة/checkout/دفع** في هذه المرحلة: زر «أضف إلى السلة» للزائر يفتح دعوة تسجيل الدخول/إنشاء حساب
  ولا يُرسل أي طلب سلة إطلاقًا؛ وللمستخدم المسجّل يعرض رسالة صريحة أن السلة في التحديث القادم (بلا نجاح وهمي).

## 2) بنية المجلدات

```
frontend/shop/
├── index.html                  # هيكل المتجر (header/nav/main/footer + drawer)
├── assets/
│   ├── css/shop.css            # أنماط المتجر (بنطاق shop-*) فوق tokens/components المشتركة
│   └── js/
│       ├── shop.js             # الطبقة الأساسية: routing، نماذج المنتجات، حالة الزائر، الـtoast والـprompt
│       ├── shop.pages.js       # صفحات: home · products · product · login · register · notfound
│       └── shop.app.js         # التشغيل: إعداد الـAPI المركزي، الموجّه، الهيدر/الدروer، الجلسة
└── (لا شيء آخر)
```

الملفات المشتركة مع لوحة الإدارة (تُحمَّل من `../assets/...`، بلا نسخ):

| مشترك | الاستخدام في المتجر |
| --- | --- |
| `assets/css/tokens.css` | الهوية البصرية الوحيدة (ألوان/مسافات/خطوط/ظلال/حركات) |
| `assets/css/base.css` · `components.css` | الأزرار والحقول والبطاقات والـmodal والـtoast والحالات |
| `assets/js/core/config.js` | عنوان الـAPI (`/alwled-api/api/v1`) مع تجاوز `?api=` أو `data-api-base` |
| `assets/js/core/api.js` | **عميل الـAPI المركزي الوحيد** — لا fetch في صفحات المتجر |
| `assets/js/core/session.js` | access token في الذاكرة + refresh في `localStorage` |
| `assets/js/core/format.js` | عرض المبالغ كما وردت من الـBackend (Decimal نصّيًا) |

## 3) التوجيه (Hash router)

| Route | الصفحة |
| --- | --- |
| `#/` | الرئيسية (Hero · أحدث المنتجات · التصنيفات · العلامات · مزايا المتجر) |
| `#/products` | كل المنتجات + بحث/تصنيف/علامة/ترتيب/تصفيح (بارامترات مدعومة فقط) |
| `#/products?view=categories` | كل التصنيفات |
| `#/products?view=brands` | كل العلامات |
| `#/products/:id` | تفاصيل المنتج (معرض صور · سعر · مواصفات · توفّر · كمية · CTA) |
| `#/login` · `#/register` | مداخل المصادقة (نفس عقود الـBackend الحقيقية) |
| أي رابط آخر | حالة «الصفحة غير موجودة» |

## 4) الـAPI المستخدم فعليًا (متاح للزائر بلا توثيق)

`GET /products` (page · limit · search · categoryId · brandId · sortBy · sortOrder) ·
`GET /products/{id}` · `GET /categories` · `GET /brands` — والمصادقة: `POST /auth/login` ·
`POST /auth/register` · `POST /auth/refresh` · `GET /auth/me` · `POST /auth/logout`.

ما هو **غير** مستدعى من المتجر: `/cart` · `/orders` · `/payments` · `/verification` · أي مسار `/admin/*`
(اختبار آلي يتحقق من غيابها في كود المتجر — انظر `frontend/tests/shop.test.js`).

## 5) حالة الزائر

| الحالة | كيف تظهر |
| --- | --- |
| زائر (بلا جلسة) | أزرار «تسجيل الدخول» و«إنشاء حساب» في الهيدر؛ زر السلة يفتح دعوة المصادقة |
| عميل مسجّل | شريحة باسم المستخدم + زر خروج؛ زر السلة يوضّح أن السلة في التحديث القادم |
| موظف/مدير مسجّل | نفس الحالة تمامًا — **لا واجهة إدارة داخل المتجر** |

الجلسة تُقرأ من نفس بنية لوحة الإدارة (`alwled.session`) — أي تسجيل دخول في المتجر يظهر في اللوحة والعكس،
والصلاحيات النهائية تُفرض دائمًا من الخادم.

## 6) السلة ومعاينة الطلب (Stage 14.2)

| Route | الوصف |
| --- | --- |
| `#/cart` | سلة المشتريات: صورة/اسم/سعر الوحدة/إجمالي السطر، أزرار كمية (1…min(20, المتاح))، حذف، تفريغ، ملخّص من الخادم |
| `#/checkout` | **معاينة الطلب فقط**: الأصناف + المجموع الفرعي + الخصم + التوصيل + الإجمالي + العملة من `POST /checkout/preview` |
| `#/account` | نائب واضح: يعرض بيانات الحساب الحقيقية من `/auth/me` ويصرّح أن صفحة الطلبات للمرحلة القادمة |

**سلوك الزائر:** فتح `#/cart` أو `#/checkout` يعرض «تسجيل الدخول مطلوب» (تسجيل الدخول / إنشاء حساب / متابعة التصفح) **بلا أي نداء للسلة**.
**إضافة للسلة كزائر:** تُحفظ النيّة (productId + quantity فقط في `sessionStorage`) ثم تُنفَّذ تلقائيًا بعد الدخول/التسجيل، وينتقل المستخدم إلى السلة. لا يُخزَّن أي سعر أو إجمالي في المتصفح — السلة تُقرأ دائمًا من الـBackend.
**الأخطاء:** 401 (refresh مرة واحدة تلقائيًا ثم طلب دخول) · 404 (منتج محذوف) · 409 (حدّ الكمية/التوفّر) · 400 (تحقق) · انقطاع شبكة — كلها برسائل عربية واضحة بلا أي تفاصيل تقنية.
**ممنوع في هذه المرحلة:** إنشاء طلب (`POST /orders`) أو دفع — زر «متابعة» يشرح بصدق أن الخطوة التالية قيد الإنشاء.

## 7) رحلة العميل الكاملة (Stage 14.3)

المسارات المضافة (hash router):

| المسار | الصفحة | الـAPI المستخدم |
| --- | --- | --- |
| `#/orders` | طلباتي (قائمة + دمج حالة الدفع من `/payments`) | `GET /orders`, `GET /payments` |
| `#/orders/:id` | تفاصيل الطلب + خط زمني حقيقي + إلغاء (إن سمحت الحالة) | `GET /orders/{id}`, `POST /orders/{id}/cancel` |
| `#/orders/:id/payment` | الدفع: إنشاء دفعة شام كاش + إرسال إثبات | `POST /payments`, `GET /payments/sham-cash/account`, `POST /payments/{id}/submit` |
| `#/notifications` | إشعاراتي + تفضيلات + تعليم مقروء/الكل | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `GET|PATCH /notifications/preferences` |
| `#/account` | البيانات · كلمة المرور · الجلسات · الخروج/الخروج من الكل · اختصارات | `GET /users/me`, `PATCH /users/me`, `POST /auth/change-password`, `GET /auth/sessions`, `POST /auth/logout-all` |
| `#/verification` | توثيق الحساب (حالة + بدء/إلغاء) | `GET /verification/me`, `POST /verification/start`, `POST /verification/cancel` |
| `#/checkout` | معاينة ثم **إنشاء طلب حقيقي** + شاشة نجاح | `POST /checkout/preview`, `POST /orders` |

قواعد الالتزام (Stage 14.3):

- **لا نجاح وهمي**: لا يوجد أي مسار في الواجهة يكتب `SUCCEEDED`/`VERIFIED` — الحالة تُعرض كما يعيدها الخادم فقط.
- **لا رفع ملفات مُخترع**: عقد الـBackend يستقبل `proofUrl` كسلسلة (لا endpoint لرفع ملف) ⇒ الواجهة تعرض حقل **رابط** مع تحقق `http/https` وحد 512 حرفًا، ولا ترسل الملف إلى أي خدمة خارجية.
- **مفاتيح idempotency ثابتة**: مفتاح واحد لكل نية منطقية (نفس بصمة السلة/الطلب) في `sessionStorage` مع نسخة في ذاكرة الصفحة ⇒ النقر المزدوج أو إعادة المحاولة لا تُنشئ طلبًا/دفعة ثانية.
- **المبلغ والحالة من الخادم**: لا عملية حسابية على المال في المتصفح، ولا حقل مبلغ/حالة يُرسل من العميل.
- **الإشعارات**: العدّاد من `GET /notifications/unread-count` فقط، بلا polling عدائي (نداء عند البدء وبعد الأحداث وبفاصل ≥20 ثانية عند التنقل)، ولا تُبنى روابط من محتوى غير موثوق (`textContent` فقط).
- **عزل المتجر عن اللوحة**: لا استدعاء لأي مسار `/admin` أو موظفين/أدوار/تدقيق/لوحة من ملفات المتجر (اختبار آلي في `frontend/tests/`).

## 8) الأمور غير المكتملة (خارج نطاق 14.3)

- **بيانات شام كاش غير مهيأة**: `GET /payments/sham-cash/account` يعيد `configured=false` ⇒ الواجهة تعرض «بيانات الدفع غير مهيأة حالياً» ولا تخترع رقم محفظة (بانتظار مفاتيح التاجر الرسمية).
- **لا رفع ملفات إثبات**: العقد الحالي يستقبل رابطًا فقط.
- **لا إلغاء جلسة مفردة**: الـAPI يوفّر `GET /auth/sessions` فقط (لا revoke لجلسة واحدة) ⇒ المتجر يعرض القائمة + «خروج من كل الأجهزة».
- لا توجد صور منتجات حالياً في قاعدة البيانات (المنتجات التجريبية بلا صور) ⇒ يُعرض placeholder محترم بدل أي صورة خارجية.

## 9) الاختبارات والفحص

```bash
npm run frontend:test     # يشمل shop.test.js · shop.cart.test.js · shop.order-flow.test.js
npm run frontend:check    # يفحص أسرار/CND/محلية الملفات/RTL
python3 frontend/tools/qa_shop.py         # QA الزائر (14.1) ⇒ frontend/tools/qa/shop/
python3 frontend/tools/qa_shop_cart.py    # QA السلة/المعاينة (14.2) ⇒ frontend/tools/qa/shop-cart/
python3 frontend/tools/qa_shop_143_api.py # رحلة العميل على الـAPI: عقود/عزل/تزامن/سلامة ⇒ frontend/tools/qa/shop143/
python3 frontend/tools/qa_shop_143_ui.py  # رحلة الواجهة الكاملة + قرار الأدمن + 8 مقاسات ⇒ frontend/tools/qa/shop143/shots/
python3 scripts/stage143-fingerprint.py before|after   # بصمة DB + فحوص سلامة
```
