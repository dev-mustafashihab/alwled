# Stage 14 — Full System Integration & End-to-End Validation

مرجع التكامل الفعلي بين الواجهة الثابتة والـBackend الحقيقي. **لا يحتوي أي أسرار.**

## 1) Architecture flow (المسار الحقيقي المُثبت)

```
Static frontend (HTML/CSS/Vanilla JS)
        │  fetch → /alwled-api/api/v1 (same origin, Bearer access token)
        ▼
Auth (JWT access + refresh rotation) → Roles/Permissions guards → DTO validation
        ▼
Cart → Checkout preview → Order creation ──► Inventory RESERVATION
        │                                            │
        │                                            └─► inventory_movements (RESERVATION/RELEASE)
        ▼
Payment (SHAM_CASH, manual) → submit(evidence) → PENDING_REVIEW
        ▼
Admin review → confirm (SUCCEEDED) | reject (FAILED)   [قرار موظف موثّق فقط]
        ▼
Notifications (in-app) + NotificationOutbox (transactional outbox, dispatched after commit)
        ▼
Dashboard / Analytics (read-only aggregations) · Audit log (append-only)
```

Verification: `POST /verification/start` → `PENDING` → admin `review` → `IN_REVIEW` → `verify` → `VERIFIED`
أو `reject(reason)` → `REJECTED` (مزوّد `LOG` فقط — لا نداء خارجي).

## 2) E2E scenarios المنفَّذة

| # | السيناريو | الملف |
| --- | --- | --- |
| A | حسابات + كتالوج + مخزون أساسي | `scripts/stage14-integration.py` |
| B | سلة → checkout preview → طلب → تلخيص الطلب → تغيير سعر المنتج لاحقًا | `scripts/stage14-integration.py` |
| C | دفعة → رفع إيصال شام كاش → مراجعة أدمن (تأكيد/رفض) + state machine + إلغاء طلب | `scripts/stage14-integration-p2.py` |
| D | تزامن: سباق مخزون، idempotency متوازٍ، dedup إشعارات، outbox بمعالجين متوازيين | `scripts/stage14-integration-p2.py` |
| E | تحقق العملاء (PENDING → IN_REVIEW → VERIFIED / REJECTED) | `scripts/stage14-integration-p3.py` |
| F | موظف → دور → صلاحية → `/auth/me.permissions[]` → حرس الخادم + تعطيل الموظف | `scripts/stage14-integration-p3.py` |
| G | عزل المستخدمين (404 بلا كشف وجود) | `scripts/stage14-integration-p3.py` |
| H | Dashboard/Analytics مقابل SQL + Audit بلا أسرار | `scripts/stage14-integration-p3.py` |
| I | دورة الجلسة: refresh/rotation/reuse detection/logout/logout-all | `scripts/stage14-integration-p3.py` |
| J | رحلة الواجهة الفعلية (Playwright) + deep links + موبايل + أخطاء + CORS | `scripts/stage14-frontend-journey.py` |

## 3) Test data convention

- أسماء الحسابات: `Stage14-A` / `Stage14-B` / `Stage14-Emp` مع بريد `*stage14*@alwled.test`.
- الهواتف: `0955900001` (عميل A) · `0955900002` (عميل B) · `0955900003` (موظف).
- المخزون/المنتجات: `slug = stage14-*` · الروبوتات/السباقات: `منتج سباق Stage14 <runId>`.
- الأدوار: `STAGE14READER<digits>` (أحرف كبيرة وأرقام فقط — قاعدة تسمية الأدوار في الـBackend).
- مفاتيح idempotency: `<runId>-order-N` · `<runId>-pay-N` · `<runId>-race-N`.
- السكربت idempotent: إن كان الحساب موجودًا أو حُدّد المعدّل (429) يكمل بالدخول بدل التسجيل.

## 4) Cleanup strategy

1. `scripts/stage14-cleanup-generator.py` يجمع المعرّفات بالعلامات (`first_name ILIKE 'Stage14%'`, `slug ILIKE '%stage14%'`, `roles.name ILIKE 'STAGE14%'`) ويكتب:
   - `/tmp/stage14-cleanup-preview.txt` — كل الصفوف المرشّحة للمراجعة البشرية قبل التنفيذ.
   - `scripts/stage14-cleanup.sql` — حذف **بالمعرّفات فقط** داخل `BEGIN/COMMIT` وبنفس ترتيب الـFK، مع استعلامات تحقق تُعيد 0.
2. محظور: `TRUNCATE` · `DELETE` بلا `WHERE` · حذف بيانات لا تحمل علامة Stage 14 · لمس أدوار النظام أو الأذونات.
3. `audit_logs` **لا تُحذف** (سجل تاريخي append-only)؛ مفتاح `actor_id` يصبح `NULL` بقاعدة الـFK، والفرق موثّق في التقرير.

## 5) API integration notes (عقود مُتحقَّقة عمليًا)

- `POST /orders` و`POST /payments` و`POST /verification/start` تتطلب ترويسة `Idempotency-Key`؛ نفس المفتاح + طلب مختلف ⇒ **409**.
- رفع إيصال شام كاش يتطلب `transactionReference` **و`proofUrl`** معًا؛ `proofNote` اختياري، ومرجع المعاملة فريد على مستوى الجدول (تكرار ⇒ 409).
- تأكيد الدفعة/رفضها **قرار موظف** (`reviewed_by`, `reviewed_at`)، والرفض بلا سبب ⇒ 400، وإعادة القرار ⇒ 409.
- تأكيد الدفعة **لا** ينشئ حركة `SALE` ولا يخصم المخزون (إلغاء الطلب هو ما ينشئ `RELEASE`).
- `GET /permissions` يُعيد الصلاحيات ببنية متداخلة (`key` لكل صلاحية)؛ `/auth/me.permissions[]` هي مصدر بوابة الواجهة.
- `POST /roles` يقبل أسماء بأحرف كبيرة وأرقام فقط.
- `PATCH /employees/:id/status` + `POST /employees/:id/roles` تغيّر الصلاحيات الفعلية فورًا للجلسة الجديدة/بعد refresh، والجلسات القديمة تُرفض.
- تحليلات: `GET /admin/analytics/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day` (حدود UTC).
- حد المعدّل الفعلي: التسجيل 10/ساعة · الدخول 20/5دقائق · الدفع (submit) 10/15دقيقة · الطلبات 30/5دقائق (لكل IP) — سكربتات التكامل تتعامل مع 429 بإعادة محاولة مقيّدة.

## 6) Known limitations

- **لا واجهة متجر للزوار/الزبائن** حتى الآن: خطوات الزبون (سلة، checkout، إنشاء طلب، رفع إيصال) تُنفَّذ في هذه المرحلة عبر الـAPI، وتُثبَّت نتائجها في واجهة الإدارة (الطلبات، الدفعات، طابور المراجعة، الإشعارات، اللوحة). واجهة الزبون = عمل مرحلي لاحق.
- Swagger مُعطَّل على الإنتاج (`SWAGGER_ENABLED` غير مضبوط) — العقود مأخوذة من `/api/docs-json` على المضيف المحلي + الـDTOs في الكود.
- حدود معدّل المصادقة تُصفَّر بإعادة تشغيل الخدمة (المخزن في الذاكرة)؛ لذلك تشغيل السكربتات المتكرر يحتاج إعادة تشغيل أو إعادة محاولة.
- تكامل شام كاش يبقى **يدويًا** بلا API مزوّد، والتحقق يبقى بمزوّد `LOG`، والإشعارات in-app فقط.

## 7) Provider boundaries (لا نداءات خارجية)

| الحد | القيمة |
| --- | --- |
| Sham Cash API | 0 (يدوي: تعليمات + إيصال + قرار موظف) |
| SMS / Email / Push | 0 |
| Verification provider | `LOG` فقط (محلي) |
| Payment gateway | 0 |
| Webhooks | 0 |
| CDN / خطوط خارجية في الواجهة | 0 |
