# Customer Verification Architecture (Stage 9)

نطاق مستقل لإدارة **التحقق من هوية الزبون** (Identity Verification Workflow).
لا يمسّ هذا النطاق تحقّق الحساب الموجود من Stage 2 (`/auth/verify-account` الخاص برمز التحقق عبر القناة)، ولا الطلبات/الدفعات/المخزون.

> **الحالة الحالية: لا يوجد مزوّد تحقق حقيقي.**
> المزوّد الوحيد المسجَّل هو `LOG` الداخلي: لا اتصال بالإنترنت، لا HTTP، لا SMS/Email،
> ولا يستطيع أبداً تحويل الزبون إلى `VERIFIED`.

---

## 1. آلة الحالة (State Machine)

| من | إلى | من يستطيع |
| --- | --- | --- |
| `NOT_STARTED` | `PENDING` | الزبون (`POST /verification/start`) |
| `PENDING` | `IN_REVIEW` | الموظف (`verification.update`) |
| `PENDING` | `CANCELLED` | الزبون (`POST /verification/cancel`) |
| `PENDING` | `EXPIRED` | النظام (انتهاء مدّة الطلب — كسول) |
| `IN_REVIEW` | `VERIFIED` | الموظف — تُسجَّل `source=MANUAL` |
| `IN_REVIEW` | `REJECTED` | الموظف + سبب إلزامي |
| `IN_REVIEW` | `CANCELLED` | الزبون |
| `REJECTED` | `PENDING` | الزبون (إعادة محاولة، `attempt + 1`) |
| `EXPIRED` | `PENDING` | الزبون (إعادة محاولة، `attempt + 1`) |

- **نهائية:** `VERIFIED`, `CANCELLED` — لا يخرج منهما أي انتقال.
- `REJECTED`/`EXPIRED` قابلتان لإعادة المحاولة، و`start` يعيد **نفس السجل** إلى `PENDING` مع تنظيف حقول المراجعة والرفض.
- تُفرض الانتقالات في `VERIFICATION_TRANSITIONS` (ثابت واحد) ويُختبَر كل انتقال مسموح وممنوع؛ أي انتقال غير مذكور ⇒ `409`.
- **`NOT_STARTED` حالة افتراضية غير مخزَّنة:** تُعاد من `GET /verification/me` عندما لا يوجد سجل، ولا تُكتب في قاعدة البيانات.

## 2. المزوّد (Provider Abstraction)

```
CustomerVerificationService
        ↓
VerificationProviderRegistry        ← نقطة حلّ واحدة (لا اختيار موزّع في الكود)
        ↓
VerificationProvider (interface)
        ↓
LOG provider (Stage 9 الوحيد)  ·  Real provider (مستقبلاً — غير منفَّذ)
```

`VerificationProvider`:

```ts
startVerification(input): Promise<{ providerReference, status }>
getVerificationStatus(providerReference)
cancelVerification(providerReference)
```

- `VERIFICATION_PROVIDER` (افتراضي `LOG`) — **strict**: أي قيمة غير مسجَّلة تُفشل الإقلاع
  بخطأ واضح، بلا fallback صامت إلى مزوّد آخر.
- **لا مفاتيح ولا أسرار ولا روابط في هذه المرحلة**: لا وجود لـ`VERIFICATION_API_KEY`
  أو `VERIFICATION_SECRET` أو `VERIFICATION_URL`.

### LOG provider

- يكتب سطر تشغيل داخلياً ويصدر مرجعاً داخلياً `LOG-<verificationId>-A<attempt>`.
- **لا يرسل HTTP** (لا يُحقن أي HTTP client في الوحدة)، ولا SMS/Email/KYC.
- `startVerification()` ⇒ `PENDING` دائماً. ولو أعاد مزوّد ما حالة `VERIFIED` فإن الخدمة
  تتجاهلها وتُسجّل تحذيراً — لا نجاح وهمي بأي طريق.
- المرجع المزوَّد (`providerReference`) يصدر من المزوّد فقط، ولا يقبله أي DTO من العميل.

## 3. نقاط الربط المستقبلية (Future Integration Point)

لربط مزوّد حقيقي لاحقاً:
1. تنفيذ `VerificationProvider` في `src/customer-verification/providers/`.
2. إضافته إلى مصفوفة المزوّدين في `customer-verification.module.ts`.
3. `VERIFICATION_PROVIDER=<NAME>` + متغيّرات البيئة التي يطلبها عقده الرسمي فقط.
لا يحتاج أي تعديل في الخدمة أو المتحكّمات أو قاعدة البيانات.

## 4. الأمان والحدود

- **Ownership:** كل عمليات الزبون تعتمد `userId` من الـJWT؛ لا يقبل أي DTO معرّف مستخدم.
  `GET /verification/:id` يعيد `404` لسجل مستخدم آخر (لا يكشف وجوده).
- **لا مسار للعميل يغيّر النتيجة:** `POST /verification/success|verify|mock-success` غير موجودة (404)،
  وإرسال `status` أو `verified` أو `userId` أو `providerReference` ⇒ `400` (whitelist + forbidNonWhitelisted).
- **RBAC:** مسارات الأدمن تتطلب `verification.read` / `verification.update` عبر نظام الصلاحيات القائم.
- **Rate limiting:** `POST /verification/start` و`POST /verification/cancel` محدودان
  (`RATE_VERIFICATION_START_*` / `RATE_VERIFICATION_CANCEL_*`, افتراضياً 10/15د) عبر نفس بنية الـThrottler.
- **Idempotency:** نفس بنية `IdempotencyKey` المستخدمة في الطلبات/الدفعات مع نطاق `VERIFICATION`.
  نفس المستخدم + نفس المفتاح + نفس المحتوى ⇒ **نفس السجل**؛ مفتاح مختلف المحتوى ⇒ `409`.
- **لا تخزين حساس:** لا وثائق هوية، لا نسخ مستندات، لا tokens، لا أسرار. الحقول المخزّنة:
  الحالة، المزوّد، مرجعه، المصدر، المحاولة، الأوقات، سبب الرفض، ومن راجعها.
- **`User.isVerified` لا يُلمس:** مصدر الحقيقة للتحقق من الهوية هو `CustomerVerification.status`؛
  علم الحساب (`isVerified`) يخص تحقّق الحساب من Stage 2 ولا تكتبه هذه المرحلة (لا divergence).

## 5. الانتهاء (Expiration)

انتهاء المدّة **منطق كسول** لا مهمة خلفية: عند القراءة (`GET /verification/me`, تفاصيل الأدمن)
أو قبل `start`، إذا كان السجل نشطاً ومرّ `expiresAt` ⇒ يُنفَّذ انتقال `EXPIRED` مع
`completedAt` وحدث تدقيق `VERIFICATION_EXPIRED`، ثم يُسمح بإعادة المحاولة.

`VERIFICATION_REQUEST_TTL_HOURS` (افتراضي 72) يحدّد `expiresAt`.

## 6. أحداث التدقيق

| الحدث | متى | source |
| --- | --- | --- |
| `VERIFICATION_STARTED` | إنشاء/إعادة بدء طلب | `SYSTEM` |
| `VERIFICATION_SUBMITTED` | دخول الطلب طابور المراجعة | `SYSTEM` |
| `VERIFICATION_REVIEWED` | `PENDING → IN_REVIEW` | `MANUAL` |
| `VERIFICATION_VERIFIED` | `IN_REVIEW → VERIFIED` | `MANUAL` |
| `VERIFICATION_REJECTED` | `IN_REVIEW → REJECTED` + السبب | `MANUAL` |
| `VERIFICATION_CANCELLED` | إلغاء الزبون | `SYSTEM` |
| `VERIFICATION_EXPIRED` | انتهاء كسول | `SYSTEM` |

تحتوي الوسائط: `verificationId, userId, status, source, provider, providerReference, attempt`
— ولا تحتوي أي سر أو token أو مستند (مُختبَر).

## 7. المراجعة اليدوية

- `POST /admin/verifications/:id/verify` هي **الطريق الوحيد** إلى `VERIFIED` في Stage 9،
  وتُسجَّل `source=MANUAL` صراحةً — لا يُدّعى أي تحقق من مزوّد خارجي.
- `source` كمصطلح: `MANUAL` (قرار بشري) · `PROVIDER` (نتيجة مزوّد حقيقي — غير متاح حالياً) · `SYSTEM` (النظام).

## 8. قيود قاعدة البيانات

- فهرس فريد جزئي `customer_verifications_one_active_per_user`: **طلب نشط واحد لكل مستخدم**
  (`PENDING`/`IN_REVIEW`) — يمنع سباق البدء المتوازي على مستوى قاعدة البيانات لا الخدمة فقط.
- `verification_reference_requires_provider`: لا مرجع مزوّد بلا مزوّد.
- `verification_rejection_requires_reason`: `REJECTED` ⇒ سبب موجود.
- `verification_review_fields_together`: `reviewed_by` و`reviewed_at` معاً أو لا شيء.
- `verification_terminal_requires_completion`: الحالات النهائية (`VERIFIED`/`REJECTED`/`CANCELLED`) ⇒ `completed_at` موجود.
- `verification_attempt_positive`: `attempt >= 1`.

## 9. خارج النطاق صراحةً

مزوّد تحقق حقيقي: **غير منفَّذ** · اتصالات HTTP خارجية: **0** · API keys: **0** · Webhooks: **0** ·
تكامل SMS/Email: **غير منفَّذ** · واجهة تحقق وهمي للعميل: **غير موجودة** ·
لا شرط تحقق للدفع، ولا تأثير على المخزون أو الطلبات أو الدفعات.
