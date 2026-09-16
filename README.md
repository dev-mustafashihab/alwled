# Alwled — Backend (متجر الأجهزة الكهربائية)

Node.js + TypeScript (strict) + NestJS + PostgreSQL + Prisma + JWT + Argon2 + Docker + Swagger.

> **المرحلة 1:** أساس البنية (Users/Roles/Permissions + JWT + Guards + Swagger + Health).
> **المرحلة 2:** دورة حساب كاملة (Sessions/Logout/Change-Forgot-Reset Password/Verification foundation + User Management + Audit foundation).
> **المرحلة 3:** إدارة الموظفين والأدوار والصلاحيات + Effective Permissions + سجل تدقيق قابل للقراءة + قواعد حماية صارمة (Owner/Privilege escalation/Last owner).
> **المرحلة 4:** كتالوگ كامل (تصنيفات شجرية + علامات + منتجات + صور + مواصفات مرنة) + أساس مخزون (Inventory + Movements) مع قواعد نزاهة على مستوى الكود وقاعدة البيانات.
> **المرحلة 5:** سلة المشتري (Cart + CartItems) + معاينة إتمام الطلب (Checkout Preview).
> **المرحلة 6:** الطلبات (Orders + OrderItems) مع snapshots تاريخية + حجز مخزون بقفل صفوف (FOR UPDATE) + إلغاء يحرّر الحجز + Idempotency.
> **المرحلة 7:** مجال الدفعات (Payments) — مستقل عن أي مزوّد، بلا أي اتصال خارجي وبلا نجاح وهمي.
> **المرحلة 8:** دفع شام كاش **يدوي** — عرض محفظة الإدارة للزبون + رفع إثبات التحويل ورقم العملية → `PENDING_REVIEW` → قرار الموظف (تأكيد → `SUCCEEDED` / رفض → `FAILED`). لا يوجد أي API خارجي ولا مفاتيح.

## التشغيل

```bash
npm install
cp .env.example .env          # ثم املأ القيم (لا أسرار في الكود)
npx prisma migrate deploy
npx prisma db seed            # أدوار + صلاحيات (+ المالك من متغيرات البيئة)
npm run start:dev             # http://localhost:3100
```

- Swagger: `http://localhost:3100/api/docs`
- Health: `GET /api/v1/health`
- الاختبارات: `npm test` (وحدوية) و`npm run test:e2e` (قاعدة بيانات حقيقية)

## نموذج الصلاحيات (Permissions)

```
User ──< UserRole >── Role ──< RolePermission >── Permission
```

- **Effective Permissions** = اتحاد صلاحيات كل أدوار المستخدم، ويُحسب في `JwtStrategy` مع كل طلب
  (تعديل الأدوار أو الصلاحيات يسري فوراً بدون انتظار انتهاء التوكن).
- دور **OWNER** يحمل `*` (wildcard) فيمر من كل بوابة صلاحيات.
- **أدوار مخصصة** (SALES, PRODUCT_MANAGER, SUPPORT, ACCOUNTANT...) تُنشأ عبر API بدون أي Migration
  لأن `roles.name` نص حر، مع `isSystem` لحماية الأدوار الأساسية.
- بوابة واحدة فقط للتفويض: `PermissionsGuard` + `@Permissions({ any | all })` — لا يوجد نظام ثانٍ.

### الأدوار النظامية

| الدور | ملاحظات |
| --- | --- |
| OWNER | wildcard، لا يُعدَّل ولا تُعدَّل صلاحياته، ولا يمكن حذف حسابه أو تعطيله من غيره |
| ADMIN | يدير المنتجات/الطلبات/الموظفين — بدون صلاحيات الأدوار أو حذف الموظفين |
| EMPLOYEE | صلاحيات تشغيلية محدودة |
| CUSTOMER | مستخدم المتجر — بلا أي وصول للواجهات الإدارية |

## Endpoints (v1)

### Auth (المرحلة 2)
`POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` ·
`POST /auth/refresh` · `GET /auth/sessions` · `GET /auth/me` · `PATCH /users/me` ·
`POST /auth/change-password` · `POST /auth/forgot-password` · `POST /auth/reset-password` ·
`POST /auth/resend-verification` · `POST /auth/verify-account`

### Employees (المرحلة 3)
| Method | Path | الصلاحية |
| --- | --- | --- |
| POST | `/employees` | `employees.create` |
| GET | `/employees` | `employees.read` |
| GET | `/employees/:id` | `employees.read` |
| PATCH | `/employees/:id` | `employees.update` |
| PATCH | `/employees/:id/status` | `employees.update` |
| POST | `/employees/:id/roles` | `employees.update` |
| DELETE | `/employees/:id/roles/:roleId` | `employees.update` |

- `GET /employees?page=&limit=&search=&role=&status=&isVerified=&sortBy=&sortOrder=`
  والرد يحتوي `data.items` + `meta { page, limit, total, totalPages }`.
- `GET /employees/:id` يعيد `roles`, `effectivePermissions`, `activeSessions` — بدون أي أسرار.

### Roles & Permissions (المرحلة 3)
| Method | Path | الصلاحية |
| --- | --- | --- |
| GET | `/roles` · `/roles/:id` | `roles.read` |
| POST | `/roles` | `roles.create` |
| PATCH | `/roles/:id` | `roles.update` |
| DELETE | `/roles/:id` | `roles.delete` |
| PUT | `/roles/:id/permissions` | `roles.update` |
| GET | `/permissions` | `permissions.read` |

### Audit (المرحلة 3)
`GET /audit?page=&limit=&action=&actorUserId=&targetUserId=&from=&to=` — يتطلب `audit.read`.

## قواعد الحماية (Security rules)

1. **Owner غير قابل للمس**: لا ADMIN ولا EMPLOYEE ولا CUSTOMER يستطيع تعديل بيانات المالك أو
   تعطيله أو تغيير أدواره أو صلاحياته.
2. **لا تصعيد صلاحيات ذاتي**: تعديل أدوار النفس مرفوض، ومنح دور يحمل صلاحيات لا يملكها المانح مرفوض
   (حتى لو جاء الطلب مباشرة إلى API متجاوزاً الواجهة).
3. **OWNER/ADMIN لا يُمنحان إلا من المالك**.
4. **حماية آخر مالك**: لا تعطيل ولا سحب دور المالك عن آخر حساب مالك في النظام.
5. **لا حساب بدون دور**: سحب آخر دور عن مستخدم مرفوض.
6. **أدوار النظام محمية**: لا تُحذف، ودور OWNER لا يُعدَّل، وتعديل ADMIN يتطلب تأكيداً صريحاً.
7. **تعطيل موظف** يلغي كل جلساته فوراً (Refresh revoke) ويمنع الدخول والاستخدام.
8. العمليات المركبة (إنشاء موظف + إسناد دور، استبدال صلاحيات دور) داخل **Prisma transactions** ذرّية.
9. كل عملية حساسة تُسجّل في `audit_logs` بلا أي كلمات مرور أو توكنات.

## البنية

```
prisma/            schema.prisma · migrations/ · seed.ts
src/auth/          login/refresh/rotation/sessions/password/verification
src/users/         ملف المستخدم + إدارة المستخدمين
src/employees/     إدارة الموظفين (إنشاء/تعديل/حالة/أدوار)
src/roles/         CRUD للأدوار + استبدال الصلاحيات
src/permissions/   قائمة الصلاحيات مجمّعة حسب الوحدة
src/audit/         AuditService + GET /audit
src/common/        guards · decorators · filters · interceptors · utils · constants
test/              health/ auth/ employees e2e
```

## ملاحظات تشغيلية

- الأسرار في `.env` فقط؛ `.env.example` يحوي أسماء المتغيرات بلا قيم.
- `SEED_OWNER_PHONE` / `SEED_OWNER_PASSWORD` تُنشئ/تحدّث حساب المالك عند الـseed.
- معدلات الطلبات (Rate limits) قابلة للضبط من البيئة (`RATE_*`).


## المرحلة الرابعة — الكتالوگ والمخزون

### العلاقات

```
Category (شجرة parent/child حتى 3 مستويات)
   └── Product ── Brand
         ├── ProductImage[]              (صورة Basic واحدة كحد أقصى)
         ├── ProductSpecification[] ── SpecificationDefinition (TEXT|NUMBER|BOOLEAN|SELECT + unit + options)
         └── Inventory (1:1) ── InventoryMovement[]
```

- **الأسعار** `NUMERIC(12,2)` وتُعاد كنصوص في JSON (`"500.50"`) — لا حسابات عائمة على الأموال.
- **`availableQuantity` = quantity − reservedQuantity** تُحسب دائماً ولا تُخزَّن (لا انحراف ممكن).
- **المواصفات** بيانات لا أعمدة: إضافة مواصفة جديدة لا تلمس جدول `products`.
- **الصور** عبر `StorageProvider` abstraction (حالياً URL، لاحقاً S3/Cloudinary بلا تغيير API).

### Endpoints جديدة

| Method | Path | Auth | Permission |
| --- | --- | --- | --- |
| GET | /categories, /categories/:idOrSlug | عام | — (النشط فقط) |
| POST/PATCH/DELETE | /categories[/:id] | JWT | categories.create/update/delete |
| GET | /brands, /brands/:idOrSlug | عام | — (النشط فقط) |
| POST/PATCH/DELETE | /brands[/:id] | JWT | brands.create/update/delete |
| GET | /products, /products/:idOrSlug, /products/slug/:slug | عام | — (النشط فقط) |
| POST/PATCH/DELETE | /products[/:id] | JWT | products.create/update/delete |
| GET | /products/:productId/images | عام | — |
| POST/PATCH/DELETE | /products/:productId/images[/:imageId] | JWT | products.update |
| PATCH | /products/:productId/images/:imageId/primary | JWT | products.update |
| PATCH | /products/:productId/images/reorder | JWT | products.update |
| GET | /specifications, /specifications/:id | عام | — |
| POST/PATCH/DELETE | /specifications[/:id] | JWT | specifications.create/update/delete |
| GET | /products/:productId/specifications | عام | — |
| PUT | /products/:productId/specifications | JWT | products.update |
| GET | /inventory, /inventory/:productId, /inventory/:productId/movements | JWT | inventory.read |
| PATCH | /inventory/:productId | JWT | inventory.update |
| POST | /inventory/:productId/adjust | JWT | inventory.adjust |

**عام مقابل الطاقم:** نفس المسارات العامة تخدم الطاقم أيضاً — حامل `products.read` (أو categories.read/brands.read) يستطيع طلب `includeInactive=true` و`isActive=false`، و`includeInventory=true` يتطلب `inventory.read`. الـBackend هو من يفرض ذلك (OptionalAuth على المسارات العامة).

### قواعد النزاهة

- مسار المنتج **لا** يقبل حقول المخزون أو `id`/`createdAt` (فشل 400 عند الإرسال).
- نشر منتج يتطلب تصنيفاً وعلامة **نشطين**؛ المسودة (isActive=false) مسموحة مع عناصر غير نشطة.
- `compareAtPrice ≥ price` و`price ≥ 0` — في الـDTO وفي CHECK constraint بقاعدة البيانات.
- المخزون: `quantity ≥ 0`، `reservedQuantity ≥ 0`، `reservedQuantity ≤ quantity` — قفل صف `FOR UPDATE` داخل transaction + CHECK constraints.
- صورة أساسية واحدة لكل منتج: transaction + partial unique index في Postgres.
- الحذف النهائي (hard) مرفوض لأي منتج له حركات مخزون، وللتصنيفات المرتبطة بمنتجات، وللعلامات والمواصفات المستخدمة — الافتراضي تعطيل (soft).
- تعديل مواصفة مستخدمة في منتجات: تغيير النوع مرفوض (409).


## المرحلة الخامسة — السلة ومعاينة الطلب

### المبادئ

- **السلة = نيّة شراء**: لا تحجز مخزوناً (`reservedQuantity` لا يُلمس) ولا تُنقص الكمية.
- **السعر لا يُخزَّن في السلة**: يُقرأ من `Product.price` عند كل طلب، فتغيير السعر يظهر فوراً.
- **لا ثقة بالعميل**: `userId` من الـJWT فقط، وأي حقل غير معروف (`price`/`unitPrice`/`subtotal`/`userId`) يُرفض بـ400.
- **الحساب المالي** بـ`Prisma.Decimal` (NUMERIC) و`money.util` مشتركة — لا حسابات عائمة.
- **سلة واحدة لكل مستخدم** (`carts.user_id` unique) وتُنشأ عند أول إضافة فقط (GET لا ينشئ صفاً).

### Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | /cart | JWT | سلة المستخدم + لكل سطر: سعر الوحدة، المجموع الجزئي، التوفر، `issues` |
| POST | /cart/items | JWT | إضافة/ضبط كمية منتج (إضافة نفس المنتج = ضبط الكمية، لا تراكم) |
| PATCH | /cart/items/:itemId | JWT | تعديل كمية سطر يخص المستخدم الحالي |
| DELETE | /cart/items/:itemId | JWT | حذف سطر |
| DELETE | /cart | JWT | تفريغ السلة (يبقي صف السلة) |
| POST | /checkout/preview | JWT | معاينة إتمام الطلب (قراءة فقط: subtotal/discount/shipping/total) |

لا توجد Permission keys للسلة: الملكية (JWT) هي الحماية. لا checkout مجهول.

### حالات السلة القديمة (Stale cart)

`GET /cart` لا يحذف شيئاً بصمت: كل سطر يحمل `isAvailable`, `availableQuantity`, `issues`:
`PRODUCT_INACTIVE` · `PRODUCT_UNAVAILABLE` (تصنيف/علامة غير نشطة) · `OUT_OF_STOCK` · `INSUFFICIENT_STOCK`.
لا يوجد سعر قديم لتُقارن به (السعر غير مخزَّن) — `priceChanged` يصبح ذا معنى في مرحلة الطلبات فقط.

### حدود السلة (env)

`CART_MAX_ITEM_QUANTITY` (افتراضي 20) · `CART_MAX_ITEMS` (افتراضي 50) · `AUDIT_CART_EVENTS` (افتراضي true).

### أحداث التدقيق

`CART_ITEM_ADDED` · `CART_ITEM_UPDATED` · `CART_ITEM_REMOVED` · `CART_CLEARED` · `CHECKOUT_PREVIEW_CREATED` (قابلة للإسكات عبر `AUDIT_CART_EVENTS=false`).

### أخطاء متوقعة

`400` تحقق DTO/حقول غير مسموحة · `401` بلا JWT · `404` منتج غير موجود أو سطر ليس في سلتك · `409` منتج غير نشط، مخزون غير كافٍ، تجاوز الحد، سلة فارغة عند المعاينة.


## المرحلة السادسة — الطلبات وحجز المخزون

### المبادئ

- **الطلب snapshot تاريخي**: الاسم/الـSKU/الـslug/الصورة/سعر الوحدة تُنسخ لحظة الإنشاء ولا تُقرأ من Product لاحقاً.
- **الحجز لا البيع**: `reservedQuantity += qty` و`quantity` **لا تُنقص** (البيع مرحلة لاحقة).
- **الحساب على السيرفر فقط**: لا أسعار ولا كميات ولا `userId` من العميل.
- **ذرّية كاملة**: أي فشل = rollback (لا طلب، لا حجز، لا حركة، والسلة كما هي).
- **Idempotency**: `Idempotency-Key` إلزامي لكل إنشاء طلب، بلا تكرار.

### Endpoints

| Method | Path | Auth | Permission | Purpose |
| --- | --- | --- | --- | --- |
| POST | /orders | JWT | — | إنشاء طلب من السلة (Idempotency-Key إلزامي) |
| GET | /orders | JWT | — | طلبات المستخدم (صفحات + status + sort) |
| GET | /orders/:id | JWT | — | تفاصيل طلب يخص المستخدم (غير ذلك 404) |
| POST | /orders/:id/cancel | JWT | — | إلغاء (PENDING فقط للعميل) |
| GET | /admin/orders | JWT | orders.read | كل الطلبات + فلاتر (status/orderNumber/userId/createdFrom/createdTo) |
| GET | /admin/orders/:id | JWT | orders.read | تفاصيل أي طلب |
| PATCH | /admin/orders/:id/status | JWT | orders.update | PENDING→CONFIRMED أو →CANCELLED |

### دورة الحالة

`PENDING → CONFIRMED → CANCELLED` · `PENDING → CANCELLED` · `CANCELLED` نهائية. لا حالات دفع (لا PAID/FAILED/REFUNDED).

### التزامن والحجز

داخل transaction واحدة: `SELECT ... FROM inventory WHERE product_id IN (...) FOR UPDATE` (الصفوف المطلوبة فقط، ليس الجدول) → `available = quantity − reservedQuantity` → التحقق → `reservedQuantity += qty` → حركة `RESERVATION` بـ`referenceType=ORDER`. قيود `reserved_quantity <= quantity` تبقى فعّالة في قاعدة البيانات. اختبار التزامن الحقيقي: طلبان متزامنان على 4 وحدات ⇒ واحد ينجح وواحد 409، والحجز النهائي 3 لا 6.

### الإلغاء

قفل صف الطلب `FOR UPDATE` (يمنع الإلغاء المزدوج) → `reservedQuantity -= qty` (مع clamp دفاعي) → حركة `RELEASE` → `status=CANCELLED` + `cancelledAt` + `cancellationReason`. `quantity` لا تتغير. الإلغاء يعمل حتى لو صار المنتج غير نشط.

### Idempotency

جدول `idempotency_keys` بـ`UNIQUE(userId, key)`: المفتاح يُحجز داخل نفس transaction الطلب، فمحاولة إنشاء مزدوجة تُسلسَل عند الفهرس الفريد. نفس المفتاح + نفس المحتوى ⇒ يُعاد نفس الطلب (`idempotentReplay: true`)؛ نفس المفتاح + محتوى مختلف ⇒ 409. المفاتيح معزولة لكل مستخدم.

### أحداث التدقيق

`ORDER_CREATED` · `ORDER_CANCELLED` · `ORDER_STATUS_UPDATED` · `ORDER_RESERVATION_CREATED` · `ORDER_RESERVATION_RELEASED` — بلا أسرار وبلا ترويسات.

### أخطاء متوقعة

`400` تحقق DTO/حقول غير مسموحة · `401` بلا JWT · `403` بدون orders.read/orders.update · `404` طلب غير موجود أو يخص غيرك · `409` سلة فارغة، منتج غير نشط، مخزون غير كافٍ، إلغاء مزدوج، انتقال حالة غير مسموح، مفتاح مكرر بمحتوى مختلف.


## المرحلة السابعة — الدفعات (بنية مستقلة عن المزوّد)

### المبادئ

- **المبلغ والعملة من الطلب** (`Order.total` / `Order.currency`) — لا تُقبل من العميل إطلاقاً.
- **لا نجاح وهمي**: لا يوجد أي مسار HTTP يمكنه تعليم دفعة `SUCCEEDED`؛ الوصول لهذه الحالة يحتاج نتيجة مزوّد **موثّقة** في مرحلة لاحقة.
- **لا مزوّد مربوط**: `PaymentProviderRegistry` فارغة عمداً (لا استدعاء خارجي، ولا مفاتيح API).
- **دفعة واحدة لكل طلب**: قيد فريد على `payments.order_id` + 409 عند التكرار.
- **الدفع لا يلمس المخزون/السلة/الطلبات**: الحجز حصل عند إنشاء الطلب فقط.

### Endpoints

| Method | Path | Auth | Permission | Purpose |
| --- | --- | --- | --- | --- |
| POST | /payments | JWT | — | إنشاء دفعة PENDING لطلب يخص المستخدم (`Idempotency-Key` إلزامي) |
| GET | /payments | JWT | — | دفعات المستخدم (صفحات + status/method) |
| GET | /payments/:id | JWT | — | تفاصيل دفعة تخصه (غير ذلك 404) |
| GET | /admin/payments | JWT | payments.read | كل الدفعات + فلاتر (status/method/orderId/userId) |
| GET | /admin/payments/:id | JWT | payments.read | تفاصيل أي دفعة |
| POST | /admin/payments/:id/cancel | JWT | payments.update | إلغاء (PENDING/PROCESSING فقط) — لا يوجد أي مسار لتعديل الحالة عشوائياً |

### آلة الحالة

`PENDING → PROCESSING | CANCELLED` · `PROCESSING → SUCCEEDED | FAILED | CANCELLED` · `SUCCEEDED/FAILED/CANCELLED` نهائية. الانتقالات غير المسموحة = 409.

### Idempotency (مشتركة مع الطلبات)

`idempotency_keys` أصبحت بنطاقات: `UNIQUE(userId, scope, key)` مع `scope ∈ {ORDER, PAYMENT}` — لا تكرار لآلية ثانية. بصمة الطلب = `sha256({orderId})` فقط (لا مبالغ). نفس المفتاح + نفس الطلب ⇒ نفس الدفعة (`idempotentReplay: true`)؛ نفس المفتاح + طلب مختلف ⇒ 409؛ طلبات متزامنة ⇒ دفعة واحدة.

### أحداث التدقيق

`PAYMENT_CREATED` · `PAYMENT_CANCELLED` · `PAYMENT_STATUS_UPDATED` — بلا أسرار وبلا ترويسات، مع `paymentId/orderId/status/amount/currency` و`source` (ADMIN/PROVIDER/SYSTEM).

### حدود المرحلة

غير منفّذ عمداً: Sham Cash API · أي مزوّد حقيقي · Webhooks · نجاح وهمي · Refunds · Returns · نهائي المخزون (SALE) · Coupons · Shipping · Tax · Notifications · Variants.


## المرحلة الثامنة — شام كاش (دفع يدوي + مراجعة إدارية)

```
Order → POST /payments → PENDING
      → GET /payments/sham-cash/account   (بيانات محفظة الإدارة)
      → الزبون يحوّل يدوياً من تطبيق شام كاش
      → POST /payments/:id/submit         (رقم العملية + صورة الإثبات)
      → PENDING_REVIEW
      → POST /admin/payments/:id/confirm  → SUCCEEDED
        POST /admin/payments/:id/reject   → FAILED (سبب إلزامي)
```

### Endpoints

| Method | Path | Auth | الصلاحية | الوظيفة |
| --- | --- | --- | --- | --- |
| GET | /payments/sham-cash/account | JWT | — | رقم محفظة الإدارة + الاسم + التعليمات (`configured:false` إذا غير مضبوطة) |
| POST | /payments/:id/submit | JWT | — | إرسال رقم العملية + رابط إثبات التحويل → `PENDING_REVIEW` |
| POST | /admin/payments/:id/confirm | JWT | payments.update | تأكيد الاستلام → `SUCCEEDED` |
| POST | /admin/payments/:id/reject | JWT | payments.update | رفض الإثبات بسبب إلزامي → `FAILED` |
| GET | /admin/payments?status=PENDING_REVIEW | JWT | payments.read | طابور المراجعة |

### آلة الحالة (محدَّثة)

`PENDING → PENDING_REVIEW | PROCESSING | CANCELLED` · `PENDING_REVIEW → SUCCEEDED | FAILED | CANCELLED` · `PROCESSING → SUCCEEDED | FAILED | CANCELLED` · النهائية: `SUCCEEDED/FAILED/CANCELLED`.

### ضمانات
- **رقم العملية فريد** على مستوى النظام: إعادة استخدامه في دفعة أخرى = 409 (منع الاحتيال).
- **إثبات إلزامي**: قيدا قاعدة بيانات يمنعان `PENDING_REVIEW` بلا رقم/إثبات، و**يمنعان `SUCCEEDED` بلا دليل** (رقم عملية أو معرّف مزوّد).
- **قرار واحد حاسم**: تأكيد/رفض متزامنان لقفل الصف ⇒ واحد ينجح والثاني 409.
- **حدود المرحلة**: نجاح الدفع **لا** يستهلك المخزون ولا يغيّر حالة الطلب (البيع النهائي مرحلة لاحقة).
- الإعداد بالبيئة فقط: `SHAMCASH_WALLET_NUMBER` · `SHAMCASH_ACCOUNT_NAME` · `SHAMCASH_INSTRUCTIONS` · `SHAMCASH_CURRENCY` (لا مفاتيح API ولا أسرار).

### أحداث التدقيق
`PAYMENT_SUBMITTED_FOR_REVIEW` (source=CUSTOMER) · `PAYMENT_CONFIRMED` (source=ADMIN) · `PAYMENT_REJECTED` (source=ADMIN مع السبب).

---

## تشغيل المشروع من نسخة نظيفة

```bash
git clone <repo> alwled && cd alwled
cp .env.example .env      # ثم املأ القيم (لا أسرار داخل الكود)
npm ci                    # يثبّت الحزم ثم يولّد Prisma Client تلقائياً (postinstall)
npx prisma migrate deploy # تطبيق الترحيلات
npm run db:seed           # الأدوار والصلاحيات + المالك
npm run build && npm start
```
اختبارات: `npm test` (وحدة) · `npm run test:e2e` (شامل، يحتاج قاعدة بيانات).

---

## المرحلة التاسعة — التحقق من هوية الزبون (Customer Verification)

نطاق مستقل عن تحقّق الحساب (Stage 2). **لا مزوّد خارجي في هذه المرحلة**: المزوّد الوحيد `LOG` داخلي.

### آلة الحالة

```
NOT_STARTED → PENDING → IN_REVIEW → VERIFIED
                  ↓           ↓
             CANCELLED    REJECTED → PENDING (إعادة محاولة)
                  ↓
              EXPIRED → PENDING (إعادة محاولة)
```

- نهائية: `VERIFIED` · `CANCELLED`. `NOT_STARTED` حالة افتراضية غير مخزَّنة.
- كل انتقال غير مذكور ⇒ `409` (يُختبَر كل انتقال مسموح وممنوع).

### Endpoints

| Method | Path | Auth | الصلاحية | الوظيفة |
| --- | --- | --- | --- | --- |
| GET | /verification/me | JWT | — | حالة الزبون الحالي (`NOT_STARTED` إن لم يبدأ) |
| GET | /verification/:id | JWT | — | سجله فقط، وإلا `404` |
| POST | /verification/start | JWT + `Idempotency-Key` | — | بدء/إعادة بدء طلب → `PENDING` |
| POST | /verification/cancel | JWT | — | إلغاء طلب نشط → `CANCELLED` |
| GET | /admin/verifications | JWT | verification.read | طابور المراجعة (فلاتر + صفحات) |
| GET | /admin/verifications/:id | JWT | verification.read | تفاصيل الطلب |
| POST | /admin/verifications/:id/review | JWT | verification.update | `PENDING → IN_REVIEW` |
| POST | /admin/verifications/:id/verify | JWT | verification.update | `IN_REVIEW → VERIFIED` (يُسجَّل `source=MANUAL`) |
| POST | /admin/verifications/:id/reject | JWT | verification.update | `IN_REVIEW → REJECTED` + سبب إلزامي |

### ضمانات
- **مزوّد LOG فقط**: لا HTTP/SMS/Email/KYC، ولا يستطيع تحويل أحد إلى `VERIFIED`؛ ولو أبلغ مزوّد بذلك تُتجاهل النتيجة.
- **لا واجهة وهمية للعميل**: `POST /verification/success|verify|mock-success` غير موجودة (404)، وإرسال `status/verified/userId/providerReference` ⇒ `400`.
- **طلب نشط واحد لكل مستخدم** مفروض بفهرس فريد جزئي في PostgreSQL (سباق البدء المتوازي ⇒ 201 + 409).
- **Idempotency** بنفس بنية الطلبات/الدفعات (نطاق `VERIFICATION`).
- **Rate limiting**: start/cancel (افتراضياً 10/15د، قابلة للضبط بالبيئة).
- **انتهاء كسول** عند القراءة/البدء (`VERIFICATION_REQUEST_TTL_HOURS`، افتراضياً 72).
- **لا تخزين وثائق هوية** ولا أسرار، ولا يُكتب `User.isVerified` (مصدر الحقيقة هو `CustomerVerification.status`).
- تفاصيل كاملة: `docs/verification-architecture.md`.

### أحداث التدقيق
`VERIFICATION_STARTED` · `VERIFICATION_SUBMITTED` · `VERIFICATION_REVIEWED` · `VERIFICATION_VERIFIED` · `VERIFICATION_REJECTED` · `VERIFICATION_CANCELLED` · `VERIFICATION_EXPIRED`.


---

## المرحلة العاشرة — لوحة التحكم والتحليلات (Dashboard and Analytics)

قراءة فقط بالكامل: لا يوجد أي POST/PUT/PATCH/DELETE في هذه الوحدة.

### الصلاحيات
- `dashboard.read` → OWNER/ADMIN/EMPLOYEE — كل مسارات `/admin/dashboard/*`
- `analytics.read` → OWNER/ADMIN — `/admin/analytics/timeseries` (صلاحية مستقلة لأن التجميع أغلى)

### Endpoints
| Method | Path | الصلاحية | الوظيفة |
| --- | --- | --- | --- |
| GET | /admin/dashboard/overview | dashboard.read | لقطة كلية (مستخدمون/منتجات/مخزون/طلبات/دفعات/تحقق) |
| GET | /admin/dashboard/catalog | dashboard.read | المنتجات + أعلى التصنيفات والعلامات |
| GET | /admin/dashboard/orders | dashboard.read | الطلبات حسب الحالة + القيم خلال مدى |
| GET | /admin/dashboard/payments | dashboard.read | الدفعات حسب الحالة + المبالغ + شام كاش اليدوي |
| GET | /admin/dashboard/inventory | dashboard.read | الكميات/المحجوز/المتاح + المنخفض/المنتهي |
| GET | /admin/dashboard/verifications | dashboard.read | طلبات التحقق حسب الحالة |
| GET | /admin/dashboard/recent-orders | dashboard.read | أحدث الطلبات (limit حتى 50) |
| GET | /admin/dashboard/recent-payments | dashboard.read | أحدث الدفعات (بلا إثباتات/أسرار) |
| GET | /admin/dashboard/payment-review | dashboard.read | طابور مراجعة شام كاش (PENDING_REVIEW فقط) |
| GET | /admin/analytics/timeseries | analytics.read | سلسلة زمنية (day/week/month) |

### قواعد موحّدة
- **المدى:** `from` شامل و`to` غير شامل (بلا 23:59:59.999) · الافتراضي آخر 30 يوماً UTC مصفوفة على بداية اليوم ·
  الحد الأقصى 366 يوماً · كل الاستجابات تحمل `range.from/to/timezone/days/boundary`.
- **المال:** يُجمَّع NUMERIC في PostgreSQL ويُعاد نصاً (`"399.98"`) — صفر floating point.
- **المحصَّل = SUCCEEDED فقط**؛ PENDING/PENDING_REVIEW/PROCESSING مبالغ معلّقة وليست مبيعات.
- **شام كاش:** `manuallyConfirmed`/`manuallyRejected` قرار موظف (Stage 8) — لا يُوصف كتحقق مزوّد.
- **المخزون:** `available = quantity - reservedQuantity` · المنخفض حسب `lowStockThreshold` لكل سجل · المنتهي عند `available <= 0`.
- **التحقق:** نطاق مستقل عن الدفعات (`inReview` = طابور المراجعة).
- **الحدود:** لا unbounded lists · ترتيب من قائمة مسموحة فقط · لا `proofUrl` ولا أي سرّ في أي استجابة.
- تفاصيل كاملة: `docs/dashboard-analytics.md`.


---

## المرحلة الحادية عشرة — الإشعارات (Notifications, in-app)

إشعارات داخل التطبيق فقط: لا بريد/SMS/واتساب/Push، ولا أي اتصال خارجي، ولا مفاتيح.

### المسارات
| Method | Path | Auth | الصلاحية | الوظيفة |
| --- | --- | --- | --- | --- |
| GET | /notifications | JWT | — | صندوق المستخدم الحالي (صفحات ≤ 50 + فلاتر type/read/from/to) |
| GET | /notifications/unread-count | JWT | — | عدد غير المقروء (COUNT في قاعدة البيانات) |
| GET | /notifications/preferences | JWT | — | التفضيلات (الإلزامي معلَّم mandatory) |
| PATCH | /notifications/preferences | JWT | — | تعديل تفضيل قابل للتعطيل فقط |
| POST | /notifications/read-all | JWT | — | تعليم إشعاراتي كمقروءة (محدود بـuserId) |
| GET | /notifications/:id | JWT | — | إشعار لي فقط (غيره 404) |
| POST | /notifications/:id/read | JWT | — | تعليم كمقروء (Idempotent عبر قيد شرطي) |
| GET | /admin/notifications | JWT | notifications.admin.read | طابور الإدارة + فلاتر + userId |
| GET | /admin/notifications/summary | JWT | notifications.admin.read | ملخّص (إجمالي/غير مقروء/حسب النوع) |
| GET | /admin/notifications/:id | JWT | notifications.admin.read | تفاصيل |
| POST | /admin/notifications/outbox/process | JWT | notifications.admin.read | معالجة صندوق الصادر (دفعة محدودة) |

### الفكرة
- **Transactional Outbox**: كل حدث إشعار يُكتب داخل نفس transaction العملية ⇒ لا يضيع حدث بعد COMMIT،
  وفشل الإشعار لا يُبطل الطلب/الدفع/التحقق.
- **منع التكرار بقيد قاعدة بيانات**: `(userId, eventKey)` — نفس الحدث = إشعار واحد دائماً.
- **حالة التسليم منفصلة عن القراءة**: `deliveryStatus` (PENDING/DELIVERED/FAILED) و`readAt` مستقل.
- **الأحداث المربوطة فعلياً**: إنشاء/تأكيد/إلغاء الطلب · إنشاء الدفعة · إرسال الإثبات (العميل + طابور المراجعة) ·
  تأكيد/رفض الدفع · مسار التحقق كاملاً · تنبيهات المخزون **عند عبور الحد فقط**.
- **التفضيلات**: الإشعارات المعاملاتية إلزامية (محاولة تعطيلها ⇒ 400)، والتنبيهات التشغيلية قابلة للتعطيل.
- تفاصيل كاملة: `docs/notifications-architecture.md`.

---

## المرحلة الثانية عشرة — Testing + Security Hardening

مراجعة أمنية كاملة + إصلاح + اختبارات انحدار (لا ميزات جديدة).

### ما أُضيف
- `test/security.e2e-spec.ts` — **69 اختباراً أمنياً**: مصادقة (تعطيل فوري، تدوير وإعادة استخدام refresh، رموز إعادة تعيين/تحقق لمرة واحدة، حدود)، مصفوفة تصريح (مجهول/زبون/موظف/أدمن/مالك × 17 مساراً)، تصعيد امتياز (حماية OWNER، الأدوار النظامية)، IDOR/BOLA (404 للغير)، mass assignment (حقول مميزة/حالة/مبلغ/مزوّد/مدقق)، prototype pollution، SQL injection، rate limiting (وتجاهل `X-Forwarded-For`)، تسريب الأخطاء، تلاعب الدفع، تزامن (overselling/idempotency/مخزون)، سلامة قاعدة البيانات، حدود/فَزّ (inputs متطرفة)، أسطح الإدارة (outbox، dashboard للقراءة فقط، audit).
- `docs/security.md` — ضوابط المصادقة/التصريح/JWT/Hashing/Rate limiting/CORS/Helmet/التحقق/الملكية/التدقيق/المزوّدين + قائمة إنتاج.
- `docs/security-findings.md` — Threat model + جدول النتائج (F1–F15) + أرقام الاختبارات + snapshot قاعدة البيانات.
- `.dockerignore` (يمنع نسخ `.env` داخل الصورة)، وتحديث `.gitignore` (`.env.*`).

### ما أُصلح (كل إصلاح باختبار انحدار)
| # | المشكلة | الإصلاح |
| --- | --- | --- |
| F1 | جسم طلب أكبر من الحد ⇒ 500 | `HttpExceptionFilter`: `PayloadTooLargeError` ⇒ **413** |
| F2 | مدخلات عددية خارج النطاق / أخطاء Prisma عن مدخل غير صالح ⇒ 500 | خرائط أكواد Prisma/Postgres + أنماط رسائل ⇒ **400** (بلا تفاصيل داخلية) |
| F3 | محارف غير صالحة (NUL) ⇒ 500 | نفس المعالج ⇒ **400** |
| F4 | CORS كان يعكس أي origin مع credentials عند غياب الإعداد | deny-by-default + `*` بلا credentials + methods/headers صريحة |
| F5 | Swagger متاح في الإنتاج | يحتاج `SWAGGER_ENABLED=true` في production |
| F6/F7 | إرشادات DoS في `multer`/`lodash`/`picomatch`/`qs` | `overrides` إلى إصدارات مُصلَحة (High: 8 ⇒ 4، كلها dev-only) |
| F11 | `.gitignore` لا يستثني `.env.*` | استُثني مع إبقاء `.env.example` |

### ما تُرِك موثَّقًا (بلا إصلاح الآن)
- `js-yaml` عبر `@nestjs/swagger` + أدوات البناء (`@nestjs/cli`, `glob`, `tmp`): تحتاج ترقية major (Nest 11 / CLI 12) ⇒ مرحلة تبعيات مخصّصة.
- Dockerfile للتطوير (root + `start:dev`): أُبقي كما هو لعدم كسر بيئة التطوير؛ الإنتاج موثَّق في `docs/security.md` §11.
- سجلات الإشعارات/التدقيق نمت من الاختبارات، ولا حذف لأي مستخدم أو بيانات غير مثبت أنها اختبارية.
