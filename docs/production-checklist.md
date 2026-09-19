# Alwled — Production Checklist (قابلة لإعادة الاستخدام)

> انسخها إلى تذكرة النشر وعلّم البنود. لا تُعتبر ناجحة حتى تُنفَّذ فعلياً (لا "تم" بلا دليل).

## قبل النشر
[ ] Environment مُهيّأ (NODE_ENV=production · PORT · DATABASE_URL)
[ ] Secrets مُمرَّرة من خارج المستودع (JWT_SECRET · JWT_REFRESH_SECRET ≥32 حرفاً، غير placeholders)
[ ] CORS_ORIGINS محدَّد (أو فارغ = نفس الأصل)
[ ] TRUST_PROXY مطابق لعدد قفزات الـproxy
[ ] SWAGGER_ENABLED=false (قرار production)
[ ] نسخة احتياطية حديثة + **تحقق من الاسترجاع** على قاعدة منفصلة

## النشر
[ ] Build يمر: `npm run build` (أو `docker compose build`)
[ ] TypeScript: `npx tsc --noEmit` = 0 أخطاء
[ ] `npx prisma validate` = صالح
[ ] `npx prisma migrate deploy` نُفِّذ ثم `migrate status` = up to date
[ ] الخدمة أقلعت (systemd/Docker) بلا أخطاء بدء

## الفحص بعد الإقلاع
[ ] `/api/v1/health/live` = 200 (liveness)
[ ] `/api/v1/health/ready` = 200 (readiness + قاعدة البيانات)
[ ] Health لا يكشف أسراراً/عنوان DB/أثر أخطاء
[ ] CORS يعمل كما هو مُهيّأ (طلب من أصل غير مسموح يُرفض)
[ ] HTTPS فعّال + HTTP→HTTPS redirect + HSTS بعد الاستقرار
[ ] ترويسات الحماية: CSP · X-Content-Type-Options · X-Frame-Options · Referrer-Policy
[ ] Swagger: معطّل (أو محمي بقرار موثّق)
[ ] السجلات: سطر لكل طلب بمعرّف `rid=`، **بلا أسرار**، بلا 5xx متكررة

## فحص وظيفي (Smoke)
[ ] الواجهة الثابتة تُفتح مباشرة: `/alwled/` و`/alwled/shop/`
[ ] الكتالوج العام يعمل بلا تسجيل دخول
[ ] تسجيل الدخول + `/auth/me` + refresh يعمل
[ ] السلة: إضافة/تعديل/حذف/تفريغ
[ ] معاينة الطلب + إنشاء طلب حقيقي (مرة واحدة عند النقر المتكرر)
[ ] الدفع: إنشاء دفعة شام كاش + إرسال إثبات ⇒ PENDING_REVIEW
[ ] مراجعة الأدمن: تأكيد ⇒ SUCCEEDED · رفض ⇒ FAILED مع سبب
[ ] الإشعارات: العدّاد/القائمة/تعليم مقروء
[ ] التوثيق: بدء/إلغاء حسب حالة الخادم
[ ] صلاحيات: عميل لا يصل لأسطح الإدارة (403/404) · موظف مقيّد لا يتجاوز صلاحياته
[ ] سلامة البيانات: الأعداد قبل/بعد بلا حذف غير مقصود

## المراقبة والرجوع
[ ] مراقبة الحد الأدنى مُفعّلة (5xx · 429 · أخطاء DB · إعادات التشغيل · القرص)
[ ] خطة Rollback مكتوبة وجاهزة (حسب نوع الترحيل — انظر database-operations.md)
[ ] توثيق الإصدار المنشور (commit/زمن) في سجل الفريق
[ ] لا `git push` ولا أسرار في Git
