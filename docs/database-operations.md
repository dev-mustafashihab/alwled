# Alwled — Database Operations (Backup · Restore · Migration · Rollback)

> كل الأمثلة تستخدم متغيّر بيئة للاتصال — **لا كلمات مرور في الأوامر**:
> `export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' /root/alwled/.env | cut -d= -f2-)"`
> للـDocker: `docker compose exec -T db pg_dump ...`

---

## Backup (نسخ احتياطي منطقي)

```bash
# نسخة مضغوطة بصيغة مخصّصة (الأفضل للاسترجاع الانتقائي)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="alwled-$(date -u +%Y%m%dT%H%M%SZ).dump"

# أو SQL نصّي مضغوط
pg_dump "$DATABASE_URL" --format=plain | gzip > "alwled-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```
قبل أي ترحيل أو نشر: نسخة إضافية باسم صريح (`pre-migrate-<date>`).

**الاحتفاظ المقترح**
| النسخة | المدة |
| --- | --- |
| ساعية | 24 ساعة |
| يومية | 14 يوماً |
| أسبوعية | 8 أسابيع |
| قبل الترحيل | حتى ترحيلين ناجحين بعده |

**التشفير والتخزين خارج السيرفر**
```bash
gpg --symmetric --cipher-algo AES256 alwled-<ts>.dump      # تشفير بالمفتاح التناظري (من secret manager)
scp alwled-<ts>.dump.gpg backup-host:/srv/backups/alwled/  # أو rclone/rsync إلى تخزين خارجي
```
- لا تُخزَّن النسخ على نفس القرص فقط، ولا داخل المستودع، ولا في صورة Docker.
- احتفظ بالمفتاح **خارج** النسخة (secret manager) وبنسخة ورقية/مشفّرة للطوارئ.

**التحقق من النسخة (إلزامي قبل الاعتماد عليها)**
```bash
pg_restore --list alwled-<ts>.dump | head                      # القائمة تُقرأ بلا أخطاء
createdb alwled_verify_$RANDOM && pg_restore --dbname=alwled_verify_... --no-owner alwled-<ts>.dump
psql alwled_verify_... -tAc "select count(*) from users; select count(*) from orders; select count(*) from payments;"
dropdb alwled_verify_...                                       # قاعدة تحقّق مؤقتة فقط
```

---

## Restore

> ⚠️ لا تُنفَّذ على قاعدة الإنتاج مباشرةً دون قرار صريح وخطة توقف. الترتيب: **تحقّق أولاً على قاعدة منفصلة**.

```bash
# 1) قاعدة جديدة للتحقق (بيئة منفصلة تماماً)
createdb alwled_restore_check
pg_restore --dbname=alwled_restore_check --no-owner --no-acl alwled-<ts>.dump
psql alwled_restore_check -tAc "\dt" | head

# 2) عند الحاجة الفعلية: أوقف الكتابة، خُذ نسخة أخيرة، ثم أعد البناء
docker compose stop api        # أو systemctl stop alwled-api
pg_dump "$DATABASE_URL" --format=custom --file=pre-restore-<ts>.dump
dropdb alwled && createdb alwled
pg_restore --dbname=alwled --no-owner --no-acl alwled-<ts>.dump
npx prisma migrate status      # يجب أن يكون up to date
docker compose start api       # أو systemctl start alwled-api
curl -fsS localhost:3100/api/v1/health/ready
```
ملاحظات:
- مشغّلات/Sequences: `pg_restore` يستعيدها مع البيانات؛ لا حاجة لضبط يدوي.
- إن كانت النسخة من إصدار مخطط أقدم: طبّق `prisma migrate deploy` بعد الاسترجاع.
- **لا `dropdb` على الإنتاج** إلا بقرار موثّق وخطة تحقق — والبديل الأسلم دائمًا هو قاعدة جديدة + تغيير `DATABASE_URL`.

---

## Migration (production workflow)

```bash
npx prisma validate            # تحقق من صحة المخطط
npx prisma migrate status      # هل توجد ترحيلات معلّقة؟
npx prisma migrate deploy      # الأمر الوحيد المسموح في الإنتاج
npx prisma migrate status      # تأكيد: up to date
```
- **ممنوع**: `migrate dev` · `db push` · `migrate reset` (تُسقط البيانات).
- الترحيلات تُطبَّق بالترتيب وتُسجَّل في `_prisma_migrations`؛ لا تُعدَّل ملفات موجودة بعد النشر.

---

## Rollback

| نوع الترحيل | استراتيجية الرجوع |
| --- | --- |
| **إضافة (جدول/عمود/فهرس) nullable** | رجوع إصدار التطبيق السابق كافٍ — المخطط الأوسع متوافق خلفياً. |
| **قيمة enum جديدة** | تبقى في المخطط (بلا ضرر)؛ لا تُستخدم في الكود القديم. |
| **إلزام عمود/قيد جديد** | نشر إصدار متوافق + ترحيل جديد يجعل العمود nullable/يُسقط القيد (Forward-fix). |
| **إعادة تسمية/حذف عمود** | لا رجوع مباشر: إما ترحيل مضاد صريح (restore للقيم من جدول مؤقت) أو استرجاع نسخة احتياطية. |
| **بيانات تالفة** | استرجاع آخر نسخة مُتحقَّق منها على قاعدة جديدة + تبديل `DATABASE_URL`. |

خطوات الرجوع القياسية:
1. أوقف النشر الحالي (احتفظ بالحاوية/الإصدار السابق).
2. `pg_dump` للحالة الراهنة (قبل أي تغيير بيانات).
3. إن كان التغيير متوافقاً خلفياً: أعد إصدار التطبيق السابق فقط.
4. وإلا: ترحيل مضاد مُختبر على نسخة منفصلة، أو استرجاع نسخة.
5. شغّل `prisma migrate status` + `health/ready` + اختبارات دخان، ثم راقب السجلات 30 دقيقة.
6. وثّق الحادثة في `audit_logs`/سجل الفريق مع السبب والزمن.

---

## Connection & pooling

- Prisma يفتح pool داخلياً بحسب `DATABASE_URL` (يمكن ضبط `connection_limit` في الـURL عند الحاجة).
- الاتصال يُغلق بسلاسة عند `SIGTERM` (`enableShutdownHooks`).
- `health/ready` يتحقق فعلياً من الاتصال ⇒ يُستخدم كـreadiness للحاوية.
- PgBouncer ليس مطلوباً الآن (نسخة واحدة) — **مؤجَّل** ويُوثَّق كخيار مستقبلي فقط.

---

## Monitoring minimums

| المؤشر | كيف |
| --- | --- |
| HTTP 5xx | عدّ الأسطر ذات الحالة 5xx في سجلات `HTTP` |
| HTTP 429 | نفس السجل (الحالة 429) — مؤشر على حدود المعدّل أو هجوم |
| أخطاء اتصال DB | `Exceptions` + `/health/ready` |
| فشل المصادقة | 401 على `/api/v1/auth/*` |
| فشل مراجعة الدفع | دفعات `PENDING_REVIEW` بدون قرار لأكثر من 24 ساعة |
| فشل الإشعارات | صفوف `notification_outbox` بحالة غير `PROCESSED` |
| تكرار إعادة التشغيل | `systemctl show alwled-api -p NRestarts` أو `docker inspect .RestartCount` |
| قرص / حجم القاعدة | `df -h` · `psql -c "select pg_size_pretty(pg_database_size(current_database()))"` |

لا تُرسل أي telemetry إلى خدمة خارجية.
