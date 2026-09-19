/**
 * alwled shop — حسابي `#/account` (Stage 14.3): الملف الشخصي · كلمة المرور · الجلسات · الخروج · حالة التوثيق · اختصارات.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function accountPage(view) {
    shop.clear(view);
    var crumbList = [{ label: 'الرئيسية', href: '#/' }, { label: 'حسابي' }];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, { title: 'تسجيل الدخول مطلوب', text: 'سجّل دخولك لعرض بيانات حسابك.', next: '/account' });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل بيانات الحساب…'));

    return Promise.all([
      shop.api.me(),
      shop.api.sessions().catch(function () { return { sessions: [] }; }),
      shop.api.verification().catch(function () { return { status: 'NOT_STARTED' }; }),
    ]).then(function (results) {
      var user = results[0] || {};
      var sessions = (results[1] && results[1].sessions) || [];
      var activeSessions = (results[1] && results[1].activeSessions) || sessions.length;
      var verification = results[2] || {};
      ALW.session.setUser(user);

      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: 'حسابي' }),
          el('p', { class: 'shop-section__sub', text: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'عميل' }),
        ]),
        el('div', { class: 'shop-order-row__head' }, [
          shop.badge(user.status === 'ACTIVE' ? 'نشط' : String(user.status || ''), user.status === 'ACTIVE' ? 'success' : 'warning'),
          shop.badge(user.isVerified === true ? 'موثّق' : 'غير موثّق', user.isVerified === true ? 'success' : 'neutral'),
        ]),
      ]));

      view.appendChild(el('div', { class: 'shop-cart' }, [
        el('div', { class: 'shop-cart__list' }, [
          profilePanel(user),
          passwordPanel(),
          sessionsPanel(sessions, activeSessions),
        ]),
        el('aside', { class: 'shop-cart__aside' }, [
          shortcutsPanel(verification),
        ]),
      ]));
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/account' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل بيانات الحساب', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { accountPage(view); } }),
      ]));
      return false;
    });
  }

  function profilePanel(user) {
    var first = el('input', { class: 'input', id: 'shop-account-first', attrs: { maxlength: '64', value: user.firstName || '' } });
    var last = el('input', { class: 'input', id: 'shop-account-last', attrs: { maxlength: '64', value: user.lastName || '' } });
    var phone = el('input', { class: 'input', id: 'shop-account-phone', attrs: { maxlength: '16', value: user.phone || '' } });
    var errorBox = errorTemplate('shop-account-error');
    var save = el('button', {
      class: 'btn btn--primary', type: 'button', text: 'حفظ التعديلات', attrs: { id: 'shop-account-save' },
      onclick: function (event) { saveProfile(event.currentTarget, { first: first, last: last, phone: phone }, errorBox, user); },
    });

    return el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'البيانات الأساسية' }),
      errorBox,
      el('div', { class: 'shop-auth__grid2' }, [
        field('الاسم الأول', first),
        field('الكنية', last),
      ]),
      el('div', { class: 'shop-auth__grid2', attrs: { style: 'margin-top:12px' } }, [
        field('رقم الهاتف', phone),
        field('البريد الإلكتروني', el('input', { class: 'input', id: 'shop-account-email', attrs: { value: user.email || '', disabled: 'disabled' } })),
      ]),
      el('p', { class: 'shop-note', text: 'البريد الإلكتروني غير قابل للتعديل من المتجر حالياً.' }),
      el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [save]),
    ]);
  }

  function saveProfile(button, fields, errorBox, user) {
    errorBox.hidden = true;
    var payload = {};
    if (fields.first.value.trim() && fields.first.value.trim() !== user.firstName) payload.firstName = fields.first.value.trim();
    if (fields.last.value.trim() && fields.last.value.trim() !== user.lastName) payload.lastName = fields.last.value.trim();
    if (fields.phone.value.trim() && fields.phone.value.trim() !== user.phone) payload.phone = fields.phone.value.trim();
    if (!Object.keys(payload).length) {
      shop.toast('لا توجد تغييرات لحفظها', 'info');
      return;
    }
    button.disabled = true;
    shop.api.profileUpdate(payload).then(function (updated) {
      ALW.session.setUser(updated || null);
      ALW.app.refreshShell();
      shop.toast('تم حفظ بيانات الحساب', 'success');
    }).catch(function (error) {
      showError(errorBox, fieldError(error) || shop.cartErrorInfo(error).message);
    }).then(function () {
      button.disabled = false;
    });
  }

  function passwordPanel() {
    var current = el('input', { class: 'input', id: 'shop-password-current', type: 'password', attrs: { autocomplete: 'current-password', required: 'required' } });
    var next = el('input', { class: 'input', id: 'shop-password-new', type: 'password', attrs: { autocomplete: 'new-password', required: 'required' } });
    var confirm = el('input', { class: 'input', id: 'shop-password-confirm', type: 'password', attrs: { autocomplete: 'new-password', required: 'required' } });
    var errorBox = errorTemplate('shop-password-error');
    var submit = el('button', {
      class: 'btn btn--primary', type: 'button', text: 'تغيير كلمة المرور', attrs: { id: 'shop-password-submit' },
      onclick: function (event) { changePassword(event.currentTarget, { current: current, next: next, confirm: confirm }, errorBox); },
    });

    return el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'كلمة المرور' }),
      errorBox,
      el('div', { class: 'shop-auth__form' }, [
        field('كلمة المرور الحالية', current),
        el('div', { class: 'shop-auth__grid2' }, [
          field('كلمة المرور الجديدة', next),
          field('تأكيد كلمة المرور', confirm),
        ]),
        el('p', { class: 'shop-note', text: 'تُرسل كلمة المرور إلى الخادم فقط ولا تُخزَّن في المتصفح.' }),
        submit,
      ]),
    ]);
  }

  function changePassword(button, fields, errorBox) {
    errorBox.hidden = true;
    if (!fields.current.value || !fields.next.value) {
      showError(errorBox, 'أدخل كلمة المرور الحالية والجديدة.');
      return;
    }
    if (fields.next.value !== fields.confirm.value) {
      showError(errorBox, 'كلمتا المرور الجديدتان غير متطابقتين.');
      return;
    }
    button.disabled = true;
    shop.api.changePassword({
      currentPassword: fields.current.value,
      newPassword: fields.next.value,
      confirmNewPassword: fields.confirm.value,
    }).then(function () {
      fields.current.value = '';
      fields.next.value = '';
      fields.confirm.value = '';
      shop.toast('تم تغيير كلمة المرور', 'success');
    }).catch(function (error) {
      var status = error && error.status;
      if (status === 401) showError(errorBox, 'كلمة المرور الحالية غير صحيحة.');
      else if (status === 400 || status === 422) showError(errorBox, fieldError(error) || 'كلمة المرور الجديدة لا تحقق متطلبات الأمان.');
      else showError(errorBox, shop.cartErrorInfo(error).message);
    }).then(function () {
      button.disabled = false;
    });
  }

  function sessionsPanel(sessions, activeSessions) {
    var list = sessions.length
      ? el('div', { class: 'shop-sessions' }, sessions.slice(0, 8).map(function (session, index) {
        return el('div', { class: 'shop-session' }, [
          el('div', { class: 'shop-session__main' }, [
            el('strong', { text: deviceLabel(session.userAgent) }),
            el('div', { class: 'shop-note', text: 'أُنشئت: ' + ALW.format.dateTime(session.createdAt) + ' • تنتهي: ' + ALW.format.dateTime(session.expiresAt) }),
            session.ip ? el('div', { class: 'shop-note', text: 'IP: ' + String(session.ip) }) : null,
          ]),
          index === 0 ? shop.badge('الأحدث', 'brand') : null,
        ].filter(Boolean));
      }))
      : el('p', { class: 'shop-note', text: 'لا توجد جلسات مسجّلة.' });

    return el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'الجلسات' }),
      el('p', { class: 'shop-note', text: 'عدد الجلسات النشطة: ' + activeSessions }),
      list,
      el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
        el('button', {
          class: 'btn btn--secondary', type: 'button', text: 'خروج من كل الأجهزة', attrs: { id: 'shop-logout-all' },
          onclick: function (event) { logoutAll(event.currentTarget); },
        }),
        el('button', {
          class: 'btn btn--ghost', type: 'button', text: 'خروج من هذا الجهاز',
          onclick: function () { ALW.app.logout(); },
        }),
      ]),
      el('p', { class: 'shop-note', text: 'لا نعرض أي رموز أو مفاتيح جلسات في الواجهة.' }),
    ]);
  }

  function deviceLabel(userAgent) {
    var text = String(userAgent || '');
    if (/Mozilla/.test(text) && /Linux/.test(text)) return 'متصفح على Linux';
    if (/Mozilla/.test(text) && /Windows/.test(text)) return 'متصفح على Windows';
    if (/Mozilla/.test(text) && /Android/.test(text)) return 'متصفح على Android';
    if (/Mozilla/.test(text) && /iPhone|iPad/.test(text)) return 'متصفح على iOS';
    if (/python|urllib/i.test(text)) return 'عميل آلي (اختبار)';
    return text ? text.slice(0, 42) : 'جهاز غير معروف';
  }

  function logoutAll(button) {
    button.disabled = true;
    var refresh = ALW.session.getRefresh ? ALW.session.getRefresh() : null;
    ALW.api.post('/auth/logout-all', refresh ? { refreshToken: refresh } : {}, { skipAuth: false }).then(function () {
      shop.toast('تم الخروج من كل الأجهزة', 'success');
      ALW.app.logout();
    }).catch(function (error) {
      button.disabled = false;
      shop.toast(shop.cartErrorInfo(error).message, 'danger');
    });
  }

  function shortcutsPanel(verification) {
    var status = flow.verificationStatusMeta(verification.status || 'NOT_STARTED');
    return el('div', {}, [
      el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'توثيق الحساب' }),
        el('div', { class: 'shop-order-row__head' }, [shop.badge(status.label, status.tone)]),
        el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
          el('a', { class: 'btn btn--secondary btn--block', href: '#/verification', text: 'عرض حالة التوثيق' }),
        ]),
      ]),
      el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'اختصارات' }),
        el('div', { class: 'shop-buy__actions' }, [
          el('a', { class: 'btn btn--primary btn--block', href: '#/orders', text: 'طلباتي' }),
          el('a', { class: 'btn btn--secondary btn--block', href: '#/notifications', text: 'إشعاراتي' }),
          el('a', { class: 'btn btn--ghost btn--block', href: '#/cart', text: 'السلة' }),
        ]),
      ]),
    ]);
  }

  function field(label, control) {
    return el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: control.id }, [el('span', { text: label })]),
      control,
    ]);
  }

  function errorTemplate(id) {
    return el('div', { class: 'alert alert--danger', attrs: { role: 'alert', hidden: 'hidden', id: id } }, [
      el('div', { class: 'alert__icon', text: '⚠️' }),
      el('div', {}, [el('span', { text: '' })]),
    ]);
  }

  function showError(box, message) {
    box.hidden = false;
    var target = box.querySelector('span');
    if (target) target.textContent = message;
  }

  function fieldError(error) {
    if (error && error.fields && error.fields.length) {
      return error.fields.map(function (item) { return item.message; }).filter(Boolean).join(' • ');
    }
    return '';
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.account = accountPage;
  ALW.shopAccountPage = accountPage;
})(typeof window !== 'undefined' ? window : globalThis);
