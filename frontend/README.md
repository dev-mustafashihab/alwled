# alwled — لوحة الإدارة (Frontend)

واجهة ثابتة بالكامل (HTML5 + CSS3 + Vanilla JS): **بلا Framework، بلا CDN، بلا npm، بلا خطوة Build**،
تعمل Offline، عربية RTL أولًا، ومتجاوبة من 375px حتى 1920px.

## التشغيل

```bash
# أي خادم ملفات ثابت يكفي — مثال مرفق:
python3 frontend/tools/serve.py --port 5173        # أو: npm run frontend:serve
```

ثم افتح: `http://localhost:5173/`

## ربط الـAPI

الافتراضي: نفس الأصل (`/api/v1`) — مثالي عند تقديم الواجهة خلف reverse proxy مع الـBackend.

عند تقديمها من أصل آخر (مثلًا GitHub Pages أو خادم ثابت منفصل)، حدّد العنوان بإحدى الطرق:

1. عبر الرابط: `https://panel.example/?api=https://api.example.com/api/v1`
2. عبر نوع الوسم: `<body data-api-base="https://api.example.com/api/v1">`
3. من الواجهة نفسها: زر **إعدادات الاتصال** في صفحة الدخول/حسابي (يُحفظ في متصفحك فقط).

> يجب أن يسمح `CORS_ORIGINS` في الـBackend بأصل الواجهة (والواجهة لا ترسل أي أسرار).

## البنية

```
frontend/
├── index.html                     # الهيكل + ترتيب تحميل الوحدات
├── assets/css/tokens.css          # Design Tokens (ألوان/خطوط/مسافات/ظلال/حركة) ← غيّر الهوية من هنا فقط
├── assets/css/{base,components,layout}.css
├── assets/js/core/                # config · api · session · auth · permissions · router · store · format
├── assets/js/ui/                  # dom · icons · toast · modal · feedback · forms · datatable · can · common · chart · notifications
├── assets/js/pages/               # login · dashboard · analytics · roles · account · errors · resource(factory) · resources.{catalog,ops}
├── assets/js/app.js               # الهيكل (Sidebar/Header) + التوجيه + الحمايات
├── assets/fonts/                  # خط عربي محلي (Cairo) كبديل لـTahoma على الأنظمة التي لا تتضمنه
└── tools/                         # serve.py · check.js · qa.py
```

## الاختبارات والفحص

```bash
npm run frontend:check   # فحص ثابت: أصول موجودة، بلا CDN، بلا أسرار، RTL، صياغة JS
npm run frontend:test    # 36 اختبار وحدة (format · permissions · session · config · api · auth · router)
python3 frontend/tools/qa.py --base http://localhost:5173 --api http://127.0.0.1:3100/api/v1
                         # فحص متصفح حقيقي (Playwright): تسجيل دخول، كل الصفحات، 7 مقاسات، مستخدم محدود الصلاحية
```

## الأمان

- لا أسرار ولا مفاتيح ولا كلمات مرور في الواجهة (فحص آلي في `frontend:check`).
- Access token في الذاكرة فقط، وrefresh token في `localStorage` لإبقاء الجلسة — وكل الأذونات تُفرض من الـBackend.
- إخفاء/تعطيل عناصر الواجهة يعتمد على **الصلاحيات** الواردة من `GET /auth/me`، لا على أسماء الأدوار.
- مسار غير مصرّح ⇒ صفحة 403، جلسة منتهية ⇒ تحويل إلى الدخول، وأي مورد ليس لك ⇒ 404 من الخادم.
