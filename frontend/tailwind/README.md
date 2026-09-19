# alwled — طبقة Tailwind v4 للمتجر الجديد (PHASE 1)

> هذه الطبقة **تُولّد** ملف CSS ثابتًا يُقدَّم عبر nginx. لا CDN، ولا توليد وقت التشغيل، ولا إطار JS.

## 1) التثبيت

```bash
cd /root/alwled/frontend
npm install          # يثبّت tailwindcss + @tailwindcss/cli كتبعيتين تنمويتين فقط
```

التبعيات (devDependencies):
- `tailwindcss` v4 — نواة المحرّك
- `@tailwindcss/cli` v4 — أداة البناء (Rust-based)

**لا** تُشحن إلى المتصفح. **لا** Vite/Webpack/React/Vue/Next.

## 2) الأوامر

| الأمر | الاستخدام |
|---|---|
| `npm run tw:build` | **الإنتاج** — بناء مضغوط إلى `shop/assets/css/shop.tw.css` |
| `npm run tw:watch` | التطوير — إعادة بناء تلقائية عند التعديل |
| `npm run tw:dev` | بناء غير مضغوط (تصحيح) |

## 3) المدخل والمخرج

- **المدخل:** `frontend/tailwind/input.css` (المصدر الوحيد للحقيقة للطبقة الجديدة)
- **المخرج:** `frontend/shop/assets/css/shop.tw.css` (**مُولَّد — لا يُحرَّر يدويًا**)
- **الحجم الحالي:** ‎~17.4 KB خام / ~4.1 KB gzip‎ (بلا preflight ⇒ أخف بكثير)

## 4) مسح المصادر (مهم)

الـDOM في هذا المشروع **مُولَّد من JS**، لذلك المسح على HTML وحده **يفشل**:

```css
@source "../shop/**/*.{html,js}";
@source "../assets/js/**/*.js";
@source "../../tools/qa/**/*.js";   /* حاضنة QA لتوليد أدوات الاختبار */
```
أي صنف يُستخدم في قوالب JS يُولَّد تلقائيًا. **لا** تعتمد على توليد وقت التشغيل.

## 5) الطبقات وعدم الحرب مع CSS القديم

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);   /* بلا preflight */
```

- **لا preflight** ⇒ لا يُعاد تعيين عناصر الصفحات القديمة أو لوحة الإدارة.
- كل قواعد `base` **مقيّدة بـ`.stw`** ⇒ لا تلمس الواجهة الحالية.
- الأدوات داخل `@layer utilities` ⇒ **أولوية أقل** من CSS القديم غير المُطبَّق في طبقة ⇒ القديم يفوز حتى يُرحَّل المكوّن، ثم تُحذف قواعده فيصبح الجديد فعّالًا. **صفر حرب أولويات، بلا `!important`.**

## 6) الثيم (فاتح/داكن)

- العقد كما هو: `data-theme` على `<html>` بقيم `light` / `dark` / `system` + `localStorage` + تفضيل النظام.
- التوكنز الدلالية تُقلب داخل `[data-theme='dark']` ⇒ كل أدوات Tailwind (`bg-surface` …) تنقلب تلقائيًا.
- المتغيّر المخصّص للداكن:
```css
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```
⇒ استخدم `dark:` كالمعتاد.

## 7) RTL

- `dir="rtl"` على `<html>` كما هو.
- **خصائص منطقية فقط**: `ms-*` / `me-*` / `ps-*` / `pe-*` / `start-*` / `end-*` / `text-start` / `inset-inline-*`.
- لا CSS مكرّر LTR/RTL، ولا `float: left/right`.
- الأرقام/الأسعار: `.stw-num` (عزل bidi + أرقام جدولية).

## 8) معمارية التوكنز

`@theme` يحتوي: ألوان دلالية · مقاسات نص دلالية (+ line-height) · أوزان · أنصاف · ظلال · حاوية · خط.
**لا مئات التوكنز** (‎~35‎). الداكن يعيد تعريف الألوان فقط.
عقد الحركة مُصدَّر في `:root` صراحةً: `--duration-instant/fast/base/slow/panel/focus-return` (‎`slow = 240ms`‎ مرتبط بتوقيت JS — **لا تكسره**).

## 9) Cairo

- **الخط الأساسي للمتجر** = `Cairo` أولًا في `--font-sans` (مُضمَّن محليًا في `assets/fonts/`).
- مُحسَّن: `Cairo-Regular.woff2` (‎−81%‎) مُولَّد من الأصل المحلي عبر `pyftsubset` مع **تغطية عربية 100%** (102/102 + 195/195 أشكال عرض) + **TTF كبديل آمن** في نفس `@font-face`.
- **Qomra = 0 استخدام** في واجهة المتجر.

## 10) النشر

1. `npm run tw:build` (على السيرفر — يتطلب Node؛ البناء لا يُنفَّذ في المتصفح)
2. المخرج `shop/assets/css/shop.tw.css` يُقدَّم كملف ثابت عبر nginx ✓
3. **مطلوب عند النشر:** أضف بصمة/نسخة لاسم الملف أو `?v=` + ترويسة `Cache-Control: public, max-age=31536000, immutable` (الوضع الحالي `no-store` على كل الأصول — انظر تقرير Phase 0).
4. `node_modules/` لا يُنشر ولا يُخزَّن في المستودع.

## 11) اختبار العقد (إلزامي قبل كل مرحلة)

```bash
cd /root/alwled/frontend/tools/qa/foundation
python3 contract.py        # 40+ فحصًا: مسارات · عقد DOM · إتاحة · ثيم · أساس · خط · 200% · أدمن
```
يفشل (exit 1) عند أي كسر لعقد Phase 0 ⇒ لا تنتقل لمرحلة تالية وهو أحمر.
