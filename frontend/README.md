# alwled — لوحة الإدارة (Frontend)

واجهة **ثابتة بالكامل**: HTML5 + CSS3 + **Vanilla JavaScript**.
**لا Framework · لا CDN · لا npm dependency للواجهة · لا خطوة Build** — تعمل Offline بالكامل،
عربية RTL أولًا، ومتجاوبة من 375px حتى 1920px.

> الحالة المنشورة: https://panel.fahd-car.cloud/alwled/ (نفس هذه الملفات، تقديمها عبر خادم ثابت + reverse proxy).

---

## 1. التشغيل

```bash
python3 frontend/tools/serve.py --port 5173      # أو: npm run frontend:serve
# ثم افتح http://localhost:5173/
```

أي خادم ملفات ثابت يكفي (Python http.server، nginx، GitHub Pages…). لا يوجد تجميع ولا اعتماد على الشبكة:
الخط العربي والأيقونات وكل الأنماط محلية.

## 2. ربط الـAPI

الافتراضي ذكي:
- من الجذر ⇒ `/api/v1`
- من مسار فرعي مثل `/alwled/` ⇒ `/alwled-api/api/v1` (مطابق للنشر الحالي)

ويمكن تحديده صراحةً بإحدى الطرق (بلا أسرار — عنوان فقط):
1. `?api=https://api.example.com/api/v1`
2. `<body data-api-base="…">`
3. زر **إعدادات الاتصال** داخل اللوحة (يُحفظ في متصفح المستخدم فقط)

يجب أن يسمح `CORS_ORIGINS` في الـBackend بأصل الواجهة عند اختلاف الأصل.

## 3. بنية المجلدات

```
frontend/
├── index.html                  # الهيكل + ترتيب تحميل الوحدات (بلا bundler)
├── assets/css/
│   ├── tokens.css              # Design Tokens ← الهوية البصرية كلها هنا
│   ├── base.css                # reset · RTL · typography · a11y · reduced-motion
│   ├── components.css          # الأزرار · الحقول · الجداول · المودالات · التوستات · الحالات
│   └── layout.css              # App shell (sidebar/header/content) · login · responsive
├── assets/js/
│   ├── core/                   # config · api · session · auth · permissions · router · store · format
│   ├── ui/                     # dom · icons · toast · modal · feedback · forms · datatable · can · common · chart · notifications
│   ├── pages/                  # login · dashboard · analytics · roles · account · errors · resource(factory) · resources.{catalog,ops}
│   └── app.js                  # الهيكل + تعريف الـroutes + الحمايات + التهيئة
├── assets/fonts/Cairo-Regular.ttf   # خط عربي محلي (بديل حيث لا يتوفر Tahoma)
├── assets/icons/favicon.svg
└── tools/                      # serve.py · check.js · qa.py · qa_visual.py · qa_a11y.py · qa_functional.py · qa/
```

## 4. التوجيه (Routing)

Hash routing بلا مكتبات: `#/products` · `#/payments/review` … كل تنقُّل يمرّ من `core/router.js`:

| الحالة | النتيجة |
| --- | --- |
| مسار عام (`#/login`) | يُعرض دائمًا |
| غير مسجَّل + مسار محمي | تحويل إلى `#/login?next=…` (ثم يعود للهدف بعد الدخول) |
| مسجَّل + صلاحية ناقصة | **صفحة 403** داخل اللوحة |
| مسار غير معروف | **صفحة 404** |

## 5. الجلسة والمصادقة

- `POST /auth/login` → يُخزَّن **access token في الذاكرة فقط** (لا يُكتب على القرص إطلاقًا).
- **refresh token** في `localStorage` تحت مفتاح واحد `alwled.session` (لأن الجلسة يجب أن تصمد بعد إعادة التحميل) —
  هذا تخزين مقبول لكنه معرّض نظريًا لـXSS، لذلك: لا يُخزَّن أي سرّ آخر، وكل الأذونات تُفرض من الخادم.
- `core/api.js` يجدّد الجلسة **مرة واحدة** عند 401 ثم يعيد الطلب؛ وإن فشل التجديد ⇒ إبطال الجلسة وتحويل إلى الدخول.
- 401 على مسارات المصادقة نفسها (login/refresh) لا يُسقط جلسة قائمة، ويعرض رسالة عامة بلا كشف وجود الحساب.
- تسجيل الخروج (`/auth/logout`) وإنهاء كل الجلسات (`/auth/logout-all`) متاحان من قائمة المستخدم وصفحة «حسابي».

## 6. طبقة الـAPI

لا `fetch` داخل الصفحات: كل نداء يمرّ من `core/api.js` الذي:
- يبني الاستعلام (يتجاهل القيم الفارغة)، ويرسل `Authorization` من الجلسة،
- يفكّ غلاف `{success, message, data}`،
- يوحّد الأخطاء: `network · timeout · unauthorized(401) · forbidden(403) · not_found(404) · conflict(409) · validation(400/422) · throttled(429) · server(5xx)` مع رسائل عربية،
- يُرجع أخطاء الحقول (`errors[]`) لربطها بالنموذج.

## 7. الصلاحيات في الواجهة

- الصلاحيات الفعلية تأتي من `GET /auth/me` (حقل `permissions`) — **لا فحص بالدور**.
- `ALW.can.can('products.update')` أو أي قائمة صلاحيات (`any-of`) مثل `['users.read','employees.read']`.
- `ALW.can.applyGates(root)` يحذف/يعطّل أي عنصر يحمل `data-can="…"`.
- القائمة الجانبية والصفحات والإجراءات (صفوف/مودالات) كلها مبنية على الصلاحيات.
- **إخفاء الزر ليس حماية**: الخادم يفحص كل طلب، والواجهة تعرض 403 كما يرجعها الـAPI.

## 8. Design Tokens والهوية البصرية

كل شيء في `assets/css/tokens.css`:
الألوان (brand/neutral/semantic)، الخطوط والأحجام والأوزان، المسافات، الزوايا، الظلال، مدد الحركة ومنحنياتها،
الأبعاد (sidebar/header/controls)، ومستويات z-index. **تغيير اللون الأساسي = تعديل `--brand-*` في ملف واحد.**

## 9. الوضع الداكن (Dark mode)

تبديل فوري من الهيدر أو من «حسابي» ⇒ يضبط `data-theme="dark"` على `<html>` ويُحفظ في `localStorage`
(`alwled.theme`). الوضع الافتراضي يتبع `prefers-color-scheme` عند أول زيارة. الألوان تُعاد تعريفها من نفس الـtokens.

## 10. الخطوط

`font-family: Tahoma, 'Cairo', 'Segoe UI', 'Noto Naskh Arabic', …`
Tahoma أولًا (الأكثر وضوحًا عربيًا على Windows)، وملف `Cairo-Regular.ttf` محلي كبديل على الأنظمة التي لا تتضمن Tahoma
(بلا أي طلب شبكة). الأرقام بخاصية tabular-nums لثبات الجداول.

## 11. الصفحات المتاحة (19 route)

`#/login` · `#/dashboard` · `#/analytics` · `#/products` · `#/categories` · `#/brands` · `#/specifications` ·
`#/inventory` · `#/orders` · `#/payments` · `#/payments/review` · `#/customers` · `#/verification` ·
`#/notifications` · `#/admin/notifications` · `#/employees` · `#/roles` · `#/audit` · `#/account`
+ حالات: 401 (انتهت الجلسة) · 403 · 404 · 500 · خطأ شبكة.

## 12. اختبارات وفحوص

```bash
npm run frontend:check      # ثابت: أصول موجودة · بلا CDN · بلا أسرار · RTL · صياغة JS · بلا console.log
npm run frontend:test       # 36 اختبار وحدة (format · permissions · session · config · api · auth · router)
python3 frontend/tools/qa.py --base http://localhost:5173 --api http://127.0.0.1:3100/api/v1
python3 frontend/tools/qa_visual.py       # 8 مقاسات × 9 صفحات + فحوص تخطيط + لقطات في tools/qa/visual
python3 frontend/tools/qa_a11y.py         # لوحة المفاتيح · التركيز · aria · تباين · reduced-motion
python3 frontend/tools/qa_functional.py   # عميل/موظف محدود + أداء (طلبات مكرّرة · DOM · خمول)
```

## 13. ملاحظات تكامل مع الـBackend

- لا تُحسب أي قيمة مالية أو صلاحية في الواجهة: الأسعار والمجاميع والحالات والأذونات كلها من الـAPI.
- المبالغ تُعرض كنصوص (`"350.00"`) بلا تحويل float (حفاظًا على دقة `NUMERIC(12,2)`).
- تدفّق شام كاش يدوي: الواجهة تعرض المرجع/الإثبات وتطلب **سبب الرفض** إلزاميًا؛ التأكيد قرار موظف موثّق
  (يظهر الاسم في سجل التدقيق) ولا يوجد أي اتصال بمزوّد دفع.
- الإشعارات داخل التطبيق فقط (IN_APP) — لا بريد/SMS/WhatsApp/Push.
- توسعة واحدة أُضيفت للـBackend في Stage 13: إرجاع `permissions[]` من `GET /auth/me` (إضافية، بلا تغيير في منطق التصريح).

---

## متجر الزوار (Stage 14.1) — `/alwled/shop/`

واجهة متجر عامة للزوار على نفس الدومين ونفس الـAPI، **مستقلة تمامًا** عن لوحة الإدارة في الملفات والتخطيط والتوجيه:

| البند | لوحة الإدارة `/alwled/` | متجر الزوار `/alwled/shop/` |
| --- | --- | --- |
| نقطة الدخول | `index.html` + `assets/` | `shop/index.html` + `shop/assets/` |
| الوصول | يتطلب تسجيل دخول (Guard) | **متاح للزائر بلا تسجيل** |
| التنقل | sidebar إداري (18 قسمًا) | هيدر متجر + drawer للجوال (رئيسية/منتجات/تصنيفات/علامات/بحث) |
| الـAPI | كل المسارات حسب الصلاحيات | العام فقط: `/products` · `/products/{id}` · `/categories` · `/brands` (+ مصادقة الزبون) |
| مشترك | `assets/css/tokens.css` · `assets/js/core/*` (الـAPI المركزي والجلسة والتنسيق) | نفس الملفات — بلا نسخ ولا عميل API ثانٍ |

- المسارات: `#/` · `#/products` · `#/products?view=categories|brands` · `#/products/:id` · `#/login` · `#/register` · (أي رابط آخر ⇒ «غير موجودة»).
- زر «أضف إلى السلة» للزائر يفتح دعوة تسجيل الدخول/إنشاء حساب ولا يُرسل أي طلب سلة (السلة/الدفع في مرحلة لاحقة).
- التفاصيل: `shop/README.md` · الاختبارات: `tests/shop.test.js` · QA: `tools/qa_shop.py` (+ `tools/qa_admin_regression.py`).
