# Notifications Architecture (Stage 11)

نطاق إشعارات **داخل التطبيق فقط (IN_APP)**. لا مزوّد بريد/SMS/واتساب/Push، ولا أي اتصال خارجي.

## 1. البنية

```
Domain service (Orders / Payments / Verification / Inventory)
        ↓  enqueue(tx, event)          ← داخل نفس الـtransaction
NotificationOutbox  (dedup + retry)    ← لا يُفقد حدث بعد COMMIT
        ↓  dispatch()  (in-process, بعد الـcommit)
NotificationService → NotificationProviderRegistry → InAppNotificationProvider
        ↓
Notification (inbox)  +  NotificationPreference
```

- **لا message broker ولا queue ولا worker خارجي**: المعالجة تُنفَّذ داخل التطبيق بعد الـcommit،
  ويمكن تشغيل دفعة يدوياً عبر `POST /admin/notifications/outbox/process` (محدودة).
- فشل الإشعار **لا يُرجع** أي عملية أعمال (طلب/دفع/تحقق): الـenqueue يحدث مع الامتثال للأعمال،
  والمعالجة في `try/catch` لا يرمي أبداً.

## 2. الحالات

- **حالة التسليم** (`deliveryStatus`): `PENDING → DELIVERED | FAILED` — تخص تسليم القناة فقط.
- **حالة القراءة**: حقل مستقل `readAt` — **التسليم الناجح لا يعني أن المستخدم قرأ**، والعكس صحيح.
- لا توجد حالة `READ` في enum التسليم (فصل مقصود).
- الانتقالات: `PENDING → DELIVERED` (نجاح المزوّد) أو `PENDING → FAILED` (فشل نهائي) — لا انتقال عكسي.
- القراءة: `readAt = null → timestamp` فقط (idempotent عبر `UPDATE ... WHERE readAt IS NULL`).

## 3. الأنواع والمستلمون

| Type | Recipient | Trigger |
| --- | --- | --- |
| ORDER_CREATED | العميل | إنشاء طلب ناجح |
| ORDER_CONFIRMED | العميل | تأكيد الموظف للطلب |
| ORDER_CANCELLED | العميل | إلغاء الطلب (عميل/موظف) |
| PAYMENT_CREATED | العميل | إنشاء دفعة |
| PAYMENT_SUBMITTED_FOR_REVIEW | العميل | إرسال إثبات التحويل |
| PAYMENT_REVIEW_REQUIRED | كل من يملك `payments.update` | نفس الحدث (طابور المراجعة) |
| PAYMENT_CONFIRMED | العميل | قرار موظف: تأكيد |
| PAYMENT_REJECTED | العميل | قرار موظف: رفض (بلا السبب الداخلي) |
| VERIFICATION_STARTED / REVIEWED / VERIFIED / REJECTED | العميل صاحب الطلب | أحداث التحقق الفعلية |
| LOW_STOCK / OUT_OF_STOCK | كل من يملك `inventory.read` | **عبور** الحد فقط |
| PAYMENT_REVIEW_REQUIRED | حسب الصلاحية | — |

- المستلم يُحدَّد من **event نفسه** (customer) أو من **الصلاحية** (staff) — لا بأسماء الأدوار،
  وتُطابَق الصلاحية العامة `*` (المالك) مع الصلاحية المذكورة.
- تنبيهات المخزون تُرسل **عند عبور الحدّ** لا مع كل تعديل: `available > threshold → available ≤ threshold`
  أو `available > 0 → available ≤ 0`، ويُستخدم `movementId` كمُحدِّد لكل عبور حقيقي (لا spam).

## 4. منع التكرار (Deduplication)

- مفتاح الحدث: `<TYPE>:<aggregateType>:<aggregateId>[:<discriminator>]` — مثال: `PAYMENT_CONFIRMED:payment:abc`.
  الحقول مُحدَّدة تماماً ولا يمكن أن تتصادم (لا استخدام نص حر).
- **قيد فريد في قاعدة البيانات**: `notifications (userId, eventKey)` + `notification_outbox (eventType, aggregateType, aggregateId)`.
- إعادة إرسال نفس الحدث = `upsert` بلا تغيير ⇒ لا إشعار ثانٍ، وحتى مع طلبين متوازيين يفوز القيد الفريد (P2002).

## 5. Retry

- `maxAttempts = 3` مع تأجيل متزايد بسيط؛ بعدها `FAILED` مع رسالة عربية آمنة (بلا تفاصيل داخلية).
- لا حلقة لا نهائية: الإشعار لا يولّد حدثاً يحتاج إشعاراً (لا loop).

## 6. التفضيلات

- `NotificationPreference (userId, type, inAppEnabled)` — غياب السجل = **مُفعَّل افتراضياً** (سياسة حتمية).
- **إشعارات معاملاتية إلزامية** (الطلب/الدفع/التحقق) لا يمكن تعطيلها ⇒ محاولة تعطيلها `400`.
- القابلة للتعطيل: `LOW_STOCK`, `OUT_OF_STOCK`, `PAYMENT_REVIEW_REQUIRED`.
- المستخدم يعدّل تفضيلاته فقط (userId من التوكن)؛ لا صلاحية إدارية على تفضيلات العملاء.

## 7. الخصوصية

- لا تُنسخ إلى الإشعار: رابط الإثبات، محتوى الإثبات، السبب الداخلي للرفض، أي سرّ أو token أو مستند هوية.
- المحتوى يُبنى على السيرفر من قيم الأعمال الموثوقة فقط (`notification-content.ts`)، وأي حقل غير معروف
  في الـpayload يُهمَل.
- لا ازدواج بيانات شخصية: لا بريد/هاتف في نصوص الإشعارات.

## 8. خارج النطاق (صراحةً)

Email/SMS/WhatsApp/Push: **غير منفَّذة** (لا provider ولا مفاتيح ولا اتصال)، Webhooks: **0**،
ولا Retention job آلي في هذه المرحلة (سجل الإشعارات يبقى — التنظيف مؤجَّل بقرار).
