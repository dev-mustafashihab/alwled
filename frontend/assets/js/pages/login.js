/**
 * alwled — صفحة تسجيل الدخول.
 * - رسائل خطأ عامة من الخادم (لا كشف إن كان الحساب موجودًا).
 * - إظهار/إخفاء كلمة المرور، حالة تحميل، تعطيل أثناء الإرسال، "تذكرني".
 * - رابط استعادة كلمة المرور (يرسل الطلب ويظهر رسالة عامة؛ الإرسال الفعلي غير مُنفَّذ في الـBackend).
 */
(function (global) {
  'use strict';

  var dom = global.ALW.dom;

  function render(container, context) {
    var config = global.ALW.config;
    dom.mount(container, []);

    var shell = document.createElement('div');
    shell.className = 'auth-shell';

    /* --------------------------------- hero --------------------------------- */
    var hero = document.createElement('aside');
    hero.className = 'auth-hero';
    var heroContent = document.createElement('div');
    heroContent.className = 'auth-hero__content';
    var logo = document.createElement('div');
    logo.className = 'auth-hero__logo';
    var mark = document.createElement('span');
    mark.className = 'auth-hero__logo-mark';
    mark.appendChild(dom.icon('zap', 'icon icon--lg'));
    logo.appendChild(mark);
    var brandText = document.createElement('div');
    var brandName = document.createElement('div');
    brandName.style.fontSize = 'var(--fs-lg)';
    brandName.style.fontWeight = '700';
    brandName.textContent = config.appNameFull;
    brandText.appendChild(brandName);
    var brandSub = document.createElement('div');
    brandSub.style.fontSize = 'var(--fs-xs)';
    brandSub.style.opacity = '0.8';
    brandSub.textContent = config.appTagline;
    brandText.appendChild(brandSub);
    logo.appendChild(brandText);
    heroContent.appendChild(logo);

    var heroTitle = document.createElement('h1');
    heroTitle.className = 'auth-hero__title';
    heroTitle.textContent = 'إدارة متجر الأجهزة الكهربائية من مكان واحد';
    heroContent.appendChild(heroTitle);

    var heroText = document.createElement('p');
    heroText.className = 'auth-hero__text';
    heroText.textContent = 'الطلبات، الدفعات، المخزون، العملاء والتوثيق — بصلاحيات دقيقة وسجل تدقيق كامل لكل عملية.';
    heroContent.appendChild(heroText);

    var points = document.createElement('div');
    points.className = 'auth-hero__points';
    [
      ['shield-check', 'صلاحيات مبنية على الأدوار لا على الأسماء'],
      ['boxes', 'مخزون بحجز فعلي وحركات مسجَّلة'],
      ['credit-card', 'دفعات شام كاش بمراجعة موظف موثّقة'],
      ['activity', 'سجل تدقيق دائم لكل عملية'],
    ].forEach(function (entry) {
      var point = document.createElement('div');
      point.className = 'auth-hero__point';
      var iconBox = document.createElement('span');
      iconBox.className = 'auth-hero__point-icon';
      iconBox.appendChild(dom.icon(entry[0], 'icon icon--sm'));
      point.appendChild(iconBox);
      var text = document.createElement('span');
      text.textContent = entry[1];
      point.appendChild(text);
      points.appendChild(point);
    });
    heroContent.appendChild(points);
    hero.appendChild(heroContent);

    var heroFoot = document.createElement('div');
    heroFoot.className = 'auth-hero__point';
    heroFoot.style.position = 'relative';
    heroFoot.style.zIndex = '1';
    heroFoot.style.opacity = '0.75';
    heroFoot.style.fontSize = 'var(--fs-2xs)';
    heroFoot.textContent = 'لوحة إدارة داخلية — الدخول للموظفين والمالك فقط.';
    hero.appendChild(heroFoot);
    shell.appendChild(hero);

    /* --------------------------------- panel -------------------------------- */
    var panel = document.createElement('main');
    panel.className = 'auth-panel';
    var card = document.createElement('div');
    card.className = 'auth-card';

    var mobileBrand = document.createElement('div');
    mobileBrand.className = 'auth-card__brand';
    var mobileMark = document.createElement('span');
    mobileMark.className = 'auth-hero__logo-mark';
    mobileMark.style.background = 'var(--primary)';
    mobileMark.style.border = 'none';
    mobileMark.appendChild(dom.icon('zap', 'icon icon--lg'));
    mobileBrand.appendChild(mobileMark);
    var mobileName = document.createElement('strong');
    mobileName.textContent = config.appNameFull;
    mobileBrand.appendChild(mobileName);
    card.appendChild(mobileBrand);

    var title = document.createElement('h1');
    title.className = 'auth-card__title';
    title.textContent = 'تسجيل الدخول';
    card.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.className = 'auth-card__sub';
    subtitle.textContent = 'أدخل رقم هاتفك وكلمة المرور للوصول إلى لوحة الإدارة.';
    card.appendChild(subtitle);

    var errorBox = document.createElement('div');
    errorBox.hidden = true;
    card.appendChild(errorBox);

    var formApi = global.ALW.forms.form({
      fields: [
        { name: 'identifier', label: 'رقم الهاتف', required: true, autocomplete: 'username', placeholder: '09xxxxxxxx', inputmode: 'tel' },
        { name: 'password', label: 'كلمة المرور', type: 'password', required: true, autocomplete: 'current-password', placeholder: '••••••••' },
      ],
    });
    card.appendChild(formApi.node);

    var options = document.createElement('div');
    options.className = 'row row--between mb-4';
    var remember = global.ALW.forms.checkbox({ name: 'remember', label: 'إبقاء الجلسة على هذا الجهاز' });
    remember.wrap.className = '';
    options.appendChild(remember.wrap);
    var forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.className = 'btn btn--ghost btn--sm';
    forgot.textContent = 'نسيت كلمة المرور؟';
    forgot.addEventListener('click', function () {
      openForgotPassword(formApi.control('identifier').getValue());
    });
    options.appendChild(forgot);
    card.appendChild(options);

    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn--primary btn--lg btn--block';
    submit.appendChild(dom.icon('log-in', 'icon'));
    var submitLabel = document.createElement('span');
    submitLabel.textContent = 'تسجيل الدخول';
    submit.appendChild(submitLabel);
    var spinner = document.createElement('span');
    spinner.className = 'btn__spinner';
    spinner.hidden = true;
    submit.appendChild(spinner);
    card.appendChild(submit);

    var foot = document.createElement('div');
    foot.className = 'auth-card__foot';
    var versionNote = document.createElement('div');
    versionNote.textContent = 'المنصة الداخلية — كل عملية تُسجَّل في سجل التدقيق.';
    foot.appendChild(versionNote);
    var apiNote = document.createElement('div');
    apiNote.className = 'mt-3 mono';
    apiNote.style.fontSize = 'var(--fs-2xs)';
    apiNote.textContent = 'API: ' + (global.ALW.config.apiBaseUrl || '');
    foot.appendChild(apiNote);
    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'btn btn--ghost btn--sm mt-3';
    settingsBtn.appendChild(dom.icon('settings', 'icon icon--sm'));
    var settingsLabel = document.createElement('span');
    settingsLabel.textContent = 'إعدادات الاتصال بالخادم';
    settingsBtn.appendChild(settingsLabel);
    settingsBtn.addEventListener('click', function () {
      global.ALW.openApiSettings();
    });
    foot.appendChild(settingsBtn);
    card.appendChild(foot);

    panel.appendChild(card);
    shell.appendChild(panel);
    container.appendChild(shell);

    /* --------------------------------- submit ------------------------------- */
    var busy = false;

    function setBusy(value) {
      busy = value;
      submit.disabled = value;
      spinner.hidden = !value;
      submitLabel.textContent = value ? 'جارٍ التحقق…' : 'تسجيل الدخول';
      errorBox.hidden = true;
    }

    function showError(message) {
      dom.mount(errorBox, [ui().alertBox(message, 'danger')]);
      errorBox.hidden = false;
    }

    function ui() {
      return global.ALW.ui;
    }

    function submitForm() {
      if (busy) return;
      var values = formApi.values();
      var missing = global.ALW.forms.validateRequired([
        ['identifier', values.identifier],
        ['password', values.password],
      ]);
      formApi.clearErrors();
      if (missing.length) {
        missing.forEach(function (name) {
          var control = formApi.control(name);
          control.input.classList.add('input--invalid');
          global.ALW.forms.attachError(control.wrap, name, 'هذا الحقل مطلوب');
        });
        showError('يرجى إدخال رقم الهاتف وكلمة المرور.');
        return;
      }

      setBusy(true);
      global.ALW.auth
        .login({
          identifier: values.identifier,
          password: values.password,
          remember: remember.getValue() === true,
        })
        .then(function () {
          setBusy(false);
          global.ALW.toast.success('مرحبًا بك — تم تسجيل الدخول');
          if (context && context.onSuccess) context.onSuccess();
        })
        .catch(function (error) {
          setBusy(false);
          // رسالة عامة: لا نكشف إن كان الحساب موجودًا
          var message = error && error.code === 'network'
            ? 'تعذّر الاتصال بالخادم. تحقّق من الشبكة أو من عنوان الـAPI.'
            : (error && error.message) || 'رقم الهاتف أو كلمة المرور غير صحيحة.';
          showError(message);
          if (error && error.code === 'throttled') showError(error.message);
        });
    }

    submit.addEventListener('click', submitForm);
    formApi.node.addEventListener('submit', function (event) {
      event.preventDefault();
      submitForm();
    });
    ['identifier', 'password'].forEach(function (name) {
      formApi.control(name).input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitForm();
        }
      });
    });

    setTimeout(function () {
      var first = formApi.control('identifier');
      if (first) first.focus();
    }, 60);

    return shell;
  }

  /* ---------------------------- forgot password ------------------------------ */
  function openForgotPassword(prefill) {
    var dom_ = global.ALW.dom;
    var formApi = global.ALW.forms.form({
      fields: [{ name: 'email', label: 'البريد الإلكتروني أو رقم الهاتف', required: true, value: prefill || '' }],
    });
    var body = document.createElement('div');
    body.appendChild(
      global.ALW.ui.alertBox(
        'إن كان الحساب موجودًا فسيُرسل رمز إعادة التعيين. الإرسال الفعلي (بريد/SMS) غير مُنفَّذ في هذه المرحلة — التدفق يعمل على مستوى الـAPI فقط.',
        'info',
      ),
    );
    body.appendChild(formApi.node);

    var modal = global.ALW.modal.create({ title: 'استعادة كلمة المرور', icon: 'key', size: 'sm', content: body });
    modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
    modal.addFooterButton({
      label: 'إرسال الطلب',
      className: 'btn--primary',
      loading: true,
      onClick: function () {
        var values = formApi.values();
        if (!values.email) {
          global.ALW.toast.warning('أدخل البريد أو الهاتف');
          return;
        }
        modal.setBusy(true);
        var payload = values.email.indexOf('@') !== -1 ? { email: values.email } : { phone: values.email };
        global.ALW.api
          .post('/auth/forgot-password', payload, { skipAuth: true })
          .then(function (result) {
            modal.setBusy(false);
            dom_.mount(body, [
              global.ALW.ui.alertBox(
                (result && result.message) || 'إذا كان الحساب موجوداً فسيتم إرسال رمز إعادة التعيين',
                'success',
              ),
            ]);
          })
          .catch(function (error) {
            modal.setBusy(false);
            global.ALW.toast.fromError(error);
          });
      },
    });
    modal.open();
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.login = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
