# Dashboard & Analytics (Stage 10)

نطاق قراءة فقط فوق المجالات الحالية. **لا يوجد أي mutation** في هذه الوحدة.

## 1. قاعدة التصميم

- كل الأرقام من تجميعات PostgreSQL (COUNT / GROUP BY / SUM / AVG / MIN / MAX) عبر Prisma،
  أو `$queryRaw` مع Parameterized tagged template عند الحاجة لحساب على مستوى الصف (متاح = الكمية − المحجوز).
- لا يتم تحميل صفوف إلى Node وحسابها، ولا أرقام ثابتة في الكود.
- المبالغ تُجمَّع كـNUMERIC وتُعاد **نصاً** (`"399.98"`) — لا float في أي مكان.
- الوحدة لا تستدعي AuditService: قراءة لوحة التحكم ليست حدثاً يستحق ضجيجاً في السجل.

## 2. الصلاحيات

| الصلاحية | تُمنح لمن | تفتح |
| --- | --- | --- |
| `dashboard.read` | OWNER (عبر `*`)، ADMIN، EMPLOYEE | كل `/admin/dashboard/*` |
| `analytics.read` | OWNER (عبر `*`)، ADMIN | `/admin/analytics/timeseries` |

- الفصل مقصود: تجميع السلاسل الزمنية أغلى، فله صلاحية مستقلة.
- الفحص بالصلاحيات لا بأسماء الأدوار، وJWT إلزامي — لا `@Public()` في الوحدة.

## 3. النطاقات الزمنية (قواعد موحّدة)

- `from` **شامل** و`to` **غير شامل**: `createdAt >= from AND createdAt < to` — بلا `23:59:59.999`.
- افتراضي بلا معاملات: **آخر 30 يوماً UTC**، مصفوفة على بداية اليوم (00:00 UTC) حتى تكون السلسلة اليومية 30 دلوًا.
- الحد الأقصى: **366 يوماً** (وإلا 400)، و`from >= to` ⇒ 400.
- التوقيت: **UTC** في التخزين والتجميع والعرض (`date_trunc` على أعمدة UTC).
- المعامل موجود في كل استجابة: `range: { from, to, timezone, days, boundary }`.

## 4. المسارات

| Method | Endpoint | الصلاحية | الغرض |
| --- | --- | --- | --- |
| GET | `/admin/dashboard/overview` | dashboard.read | لقطة كلية: مستخدمون/منتجات/مخزون/طلبات/دفعات/تحقق |
| GET | `/admin/dashboard/catalog` | dashboard.read | منتجات نشطة/غير نشطة/صور + أعلى التصنيفات والعلامات |
| GET | `/admin/dashboard/orders` | dashboard.read | الطلبات حسب الحالة + قيمة/متوسط/أدنى/أعلى خلال مدى |
| GET | `/admin/dashboard/payments` | dashboard.read | الدفعات حسب الحالة + مبالغ + شام كاش اليدوي |
| GET | `/admin/dashboard/inventory` | dashboard.read | كميات/محجوز/متاح + منخفض/منتهي + حركات (اختياري) |
| GET | `/admin/dashboard/verifications` | dashboard.read | طلبات التحقق حسب الحالة + طابور المراجعة |
| GET | `/admin/dashboard/recent-orders` | dashboard.read | أحدث الطلبات (limit ≤ 50) |
| GET | `/admin/dashboard/recent-payments` | dashboard.read | أحدث الدفعات (بلا أي إثبات/أسرار) |
| GET | `/admin/dashboard/payment-review` | dashboard.read | طابور PENDING_REVIEW فقط |
| GET | `/admin/analytics/timeseries` | analytics.read | سلسلة زمنية day/week/month |

## 5. التعريفات الحسّاسة

- **`available = quantity - reservedQuantity`** — نفس تعريف المشروع، بلا صيغة ثانية.
- **منخفض المخزون:** `available <= inventory.lowStockThreshold` (حدّ لكل سجل، ليس رقماً ثابتاً في الكود).
- **منتهي المخزون:** `available <= 0` (لا `quantity = 0`، احتراماً للحجوزات).
- **المبلغ المحصَّل:** `SUCCEEDED` فقط. `PENDING/PENDING_REVIEW/PROCESSING` مبالغ معلّقة.
- **شام كاش:** `manuallyConfirmedCount` / `manuallyRejectedCount` = قرار موظف (`reviewedBy` موجود)،
  و`awaitingReviewCount` = PENDING_REVIEW. لا يُوصف أي منها كتحقق مزوّد.
- **التحقق (Stage 9):** نطاق مستقل عن الدفعات؛ الأعداد بالحالة المخزّنة، و`inReview` هو طابور المراجعة.

## 6. الأداء والفهارس

- استعلامات مستقلة تُنفَّذ بـ`Promise.all` (لا سلسلة تسلسلية، ولا transaction طويلة لجمع مؤشرات).
- فهارس Stage 10: `orders(status, created_at)` و`payments(status, created_at)` — مُبرَّرة بنمط
  «تصفية بالحالة + مدى زمني» في كل استعلامات التحليلات والسلاسل الزمنية.
- على الحجم الحالي (بيانات صغيرة) يختار المخطِّط Seq Scan وهو الأرخص؛ الفهارس موجودة للنمو
  ومُتحقَّق من صلاحيتها بـ`EXPLAIN`.
- لا caching ولا Redis — قاعدة البيانات → الخدمة → API.

## 7. الخصوصية

- لا تُعاد: `passwordHash` · `refreshToken` · `tokenHash` · `apiKey` · أي سرّ · ترويسات.
- الدفعات: تُعرض `proofAttached` (وجود الإثبات) و`proofNote` فقط — **بلا `proofUrl`** أو مسار تخزين.
- الطلبات الحديثة: اسم العرض فقط (بلا بريد/هاتف)، وحدود صفحات إلزامية (≤ 50).

## 8. خارج النطاق (صراحةً)

Redis · Elasticsearch · منصّة BI · أي مزوّد تحليلات خارجي · Google Analytics · تكامل دفع ·
Sham Cash API · Webhooks · أي mutation على الطلبات/الدفعات/المخزون/المستخدمين · أرقام وهمية.
