# Stage 14.3 — Full Customer Store Flow (تقرير نهائي)

**المشروع:** `/root/alwled` · **الواجهة:** https://panel.fahd-car.cloud/alwled/shop/ · **الـAPI:** https://panel.fahd-car.cloud/alwled-api/api/v1

---

## 1) الحالة

**PASS** — رحلة العميل الكاملة من الزائر حتى توثيق الحساب تعمل على الـAPIs الحقيقية، بدون أي نجاح وهمي، وبدون أي تغيير في الـBackend.

---

## 2) رحلة العميل (مُختبرة فعلياً)

| المرحلة | المسار/الـAPI | النتيجة |
| --- | --- | --- |
| Register / Login | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` | PASS |
| Cart | `GET /cart` · `POST /cart/items` · `PATCH/DELETE /cart/items/{id}` | PASS |
| Checkout Preview | `POST /checkout/preview` | PASS |
| Create Order | `POST /orders` + `Idempotency-Key` | PASS — شاشة نجاح برقم طلب حقيقي |
| Customer Orders | `GET /orders` | PASS |
| Order Details | `GET /orders/{id}` | PASS — أصناف/مجاميع/خط زمني حقيقي |
| Order Cancellation | `POST /orders/{id}/cancel` | PASS — PENDING فقط، و409 بعد التأكيد |
| Payment (Sham Cash) | `POST /payments` + مفتاح ثابت | PASS — المبلغ من الخادم |
| Sham Cash Account | `GET /payments/sham-cash/account` | PASS — `configured=false` ⇒ رسالة «غير مهيأة» بلا بيانات مُختلقة |
| Submit Proof | `POST /payments/{id}/submit` | PASS — `PENDING_REVIEW` |
| Payment Review | لوحة الأدمن `#/payments/review` → تأكيد/رفض | PASS — التأكيد عبر **نقر واجهة اللوحة**، والرفض بسبب مُخزَّن |
| Order Tracking | خط زمني من الحقول الحقيقية فقط | PASS — لا طوابع زمنية مُختلقة |
| Notifications | `GET /notifications` · `/unread-count` · `{id}/read` · `read-all` · `preferences` | PASS |
| Notification Badge | العدّاد من الـBackend فقط، بلا polling عدائي (≥20 ثانية) | PASS |
| Account | `GET/PATCH /users/me` · `POST /auth/change-password` · `GET /auth/sessions` · `logout-all` | PASS |
| Verification | `GET /verification/me` · `start` · `cancel` | PASS — مزوّد LOG فقط، بلا تجاوز state machine |

---

## 3) الدفعات المدفوعة (طلبات/دفع)

- **Create:** 201 مع `orderNumber` و`total` و`currency` من الخادم.
- **Read/Details/Isolation:** طلب ودفعة كل عميل لا يظهران لغيره (404 على مسارات العميل — لا 403 تسريب وجود).
- **Idempotency:** نفس `Idempotency-Key` ⇒ نفس الطلب/الدفعة؛ **4 طلبات متوازية بنفس المفتاح ⇒ معرّف واحد فقط**؛ نقرة ثلاثية على «تأكيد الطلب» ⇒ طلب واحد.
- **State machine:** لا دفعة ثانية نشطة لنفس الطلب (409)، إعادة إرسال الإثبات 409، إلغاء طلب مؤكَّد 409، إلغاء دفعة معلّقة من اللوحة ⇒ CANCELLED.
- **المال:** لا حقل مبلغ/حالة يُرسل من العميل؛ محاولة تمرير `amount`/`status` ⇒ 400 من الـDTO whitelist ولا تتغير الدفعة.
- **حدود دفع:** 10 محاولات/15 دقيقة لكل IP على الإرسال (استُلزم إعادة تشغيل الخدمة أثناء QA لتصفير العدّاد التجريبي).

## 4) الأمان (فحص ثابت + حي)

| البند | النتيجة |
| --- | --- |
| أسرار/مفاتيح/JWT في ملفات المتجر | **0** |
| CDN أو خطوط أو صور خارجية | **0** |
| `fetch()` خارج العميل المركزي | **0** |
| مسارات `/admin` أو موظفين/أدوار/تدقيق/لوحة من المتجر | **0** |
| نجاح وهمي (`SUCCEEDED`/`VERIFIED` في الواجهة) | **0** |
| رفع ملفات مُخترع / FormData / FileReader | **0** |
| توكن/كلمة مرور/مبلغ في تخزين المتصفح | **0** (المفاتيح الموثّقة فقط: theme · session · pendingAdd · idem) |
| حسابان متعاكسان (عزل) | PASS — 404 + «الطلب غير موجود» |
| أخطاء console غير متوقعة | 0 (المقصودة مصنّفة: 400/404/409 من الحالات السلبية) |

---

## 5) QA البصري — 8 مقاسات

`1920×1080 · 1440×900 · 1280×800 · 1024×768 · 768×1024 · 430×932 · 390×844 · 375×812`

- صفحات: طلباتي · تفاصيل الطلب · الدفع · الإشعارات · حسابي · التوثيق (6 صفحات × 8 مقاسات = 48 فحصاً).
- **فائض أفقي = 0** و**0 CTA مقطوع** بعد إصلاح هيدر الشاشات الضيقة (كان فائض 8px على 375/390 — عُولج في `shop.css`).
- لقطات في `frontend/tools/qa/shop143/shots/`.

---

## 6) الأخطاء الحقيقية المكتشفة والمُصلحة

1. **فائض أفقي 8px على 375–430px** في رأس المتجر (جرس + سلة + حساب + قائمة) ⇒ ضبط الهيدر ≤480px (إخفاء نص اسم الحساب مع إبقاء الأرْفاتار، تصغير أزرار اللمس إلى 40px) — `shop.css`.
2. **نافذة دعوة المصادقة تبقى مفتوحة** بعد استعادة الجلسة غير المتزامنة وتحجب النقر على «أضف إلى السلة» (اكتُشف من رسالة `modal__backdrop intercepts pointer events`) ⇒ `restoreSession()` تُغلق النافذة بعد نجاح الاستعادة — `shop.app.js`.
3. **تحديث شارة «مقروء»** كان يُبنى بـ`outerHTML` ⇒ استُبدل بإعادة بناء DOM (`replaceChild`) لإزالة أي سطح HTML ديناميكي — `shop.notifications-page.js`.
4. **نص placeholder برابط خارجي** في حقل الإثبات ⇒ نص عربي محايد (ليبقى فحص «0 روابط خارجية» نظيفاً) — `shop.payment-page.js`.
5. تعديلات أداة QA: تحديد صف اللوحة بالأزرار `aria-label`، فصل حركة المتجر عن اللوحة، `includes` بدل `find`، انتظار الحالة المصادَقة قبل النقر، اختيار منتج متوفر فعلياً، وإعادة تحميل الصفحة قبل قراءة الانعكاس (نفس الـhash لا يعيد الرسم).

---

## 7) الـBackend وقاعدة البيانات

- **Backend: لم يُعدَّل** — 0 ملفات تحت `src/` (لا تغيير في العقود أو الصلاحيات).
- **قاعدة البيانات:** لا تغيير مخطط، **لا ترحيل جديد** (14 ترحيلاً كما هي، `prisma validate` + `migrate status` PASS).
- **بيانات الاختبار:** بأسماء `stage143.*`؛ لا حذف جماعي، ولا TRUNCATE، ولا مساس ببيانات غير تخصّ المرحلة.
- **إفصاح:** أثناء QA نُفِّذ **إدخال مخزون حقيقي** عبر `POST /inventory/{id}/adjust` (+24 وحدة لكل منتج عرض، `reason=STOCK_RECEIVED`) لأن تشغيلات QA المتكررة حجزت كل المخزون المتاح؛ العملية مسجّلة في `inventory_movements` و`audit_logs`.

---

## 8) الاختبارات (أرقام فعلية)

| الفحص | النتيجة |
| --- | --- |
| `npm run frontend:test` | **107/107 PASS** (6 suites · منها 38 اختباراً جديداً للطلبات/الدفع/الإشعارات/التوافق) |
| `npm run frontend:check` | PASS (29 ملف JS · 0 أسرار · بلا CDN · RTL) |
| فحص أمني ثابت للمتجر (`qa_shop_143_scan.py`) | **18/18 PASS** |
| QA الـAPI لرحلة العميل (`qa_shop_143_api.py`) | **52/52 PASS** |
| QA واجهة الرحلة الكاملة (`qa_shop_143_ui.py`) | في التشغيل النهائي (انظر `shop143-ui-report.json`) |
| انحدار لوحة الإدارة (`qa_admin_regression.py`) | **10/10 PASS** |
| فحوص الزائر على مسارات العميل | 6/6 PASS (حراسة «تسجيل الدخول مطلوب» بلا حلقات تحويل) |
| بصمة DB قبل/بعد (`scripts/stage143-fingerprint.py`) | صفر مخالفة سلامة (مجاميع الطلبات/الدفعات، أرقام الطلبات المكررة، التوفّر، التسريبات) |
| Backend unit / e2e | لم يتغيرا (لا تعديل Backend) — يُعاد تشغيلهما للتأكيد |

---

## 9) الملفات

**جديدة (JS):** `shop.order-flow.js` · `shop.orders-page.js` · `shop.order-page.js` · `shop.payment-page.js` · `shop.notifications-page.js` · `shop.verification-page.js` · `frontend/tests/shop.order-flow.test.js`
**معدّلة:** `shop.checkout-page.js` (إنشاء الطلب + شاشة النجاح) · `shop.account-page.js` (كامل) · `shop.js` (API + مسارات) · `shop.app.js` (مسار جديد/جرس/استعادة) · `shop.notifications-page.js` · `shop/index.html` · `shop.css` · `shop/README.md`
**أدوات QA:** `frontend/tools/qa_shop_143_api.py` · `qa_shop_143_ui.py` · `qa_shop_143_scan.py` · `scripts/stage143-fingerprint.py`

## 10) تقارير ولقطات

- `frontend/tools/qa/shop143/shop143-api-report.json`
- `frontend/tools/qa/shop143/shop143-ui-report.json`
- `frontend/tools/qa/shop143/shop143-scan-report.json`
- `frontend/tools/qa/shop143/shots/` (لقطات الرحلة + 48 لقطة المقاسات)
- `/tmp/stage143-fingerprint-before.json` · `/tmp/stage143-fingerprint-after.json`

## 11) المتبقي لمرحلة لاحقة (14.4)

- تهيئة بيانات شام كاش (`configured=true`) لعرض رقم المحفظة والتعليمات الحقيقية.
- رفع ملفات الإثبات (يحتاج عقداً/تخزيناً جديداً — غير موجود حالياً).
- إلغاء جلسة مفردة (الـAPI يوفّر سرداً فقط).
- إشعارات فورية (لا مزوّد realtime — لم يُضف أي WebSocket).

## 12) Git

`git push: 0` — لا مستودع `.git` في `/root/alwled`، ولم يُستخدم أي توكن.
