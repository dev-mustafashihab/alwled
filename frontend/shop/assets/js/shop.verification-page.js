/**
 * alwled shop — توثيق الحساب `#/verification` (Stage 9 architecture: مزوّد LOG فقط، القرار يدوي).
 * الواجهة تعرض الحالة وتُنفّذ start/cancel فقط حسب أعلام الخادم (canStart/canCancel) — بلا أي تجاوز.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function verificationPage(view) {
    shop.clear(view);
    var crumbList = [{ label: 'الرئيسية', href: '#/' }, { label: 'توثيق الحساب' }];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, {
        title: 'تسجيل الدخول مطلوب',
        text: 'سجّل دخولك لعرض حالة توثيق حسابك.',
        next: '/verification',
      });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل حالة التوثيق…'));

    return shop.api.verification().then(function (payload) {
      render(view, crumbList, payload || {});
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/verification' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل حالة التوثيق', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { verificationPage(view); } }),
      ]));
      return false;
    });
  }

  function render(view, crumbList, verification) {
    var status = verification.status || 'NOT_STARTED';
    var meta = flow.verificationStatusMeta(status);
    var action = flow.verificationAction(verification);

    shop.clear(view);
    view.appendChild(helpers.crumbs(crumbList));
    view.appendChild(el('div', { class: 'shop-section__head' }, [
      el('div', {}, [
        el('h1', { class: 'shop-section__title', text: 'توثيق الحساب' }),
        el('p', { class: 'shop-section__sub', text: 'التوثيق يُراجَع يدويًا من فريق المتجر.' }),
      ]),
      el('div', { class: 'shop-order-row__head' }, [
        shop.badge(meta.label, meta.tone),
        verification.isVerified === true ? shop.badge('حساب موثّق', 'success') : null,
      ].filter(Boolean)),
    ]));

    view.appendChild(el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'حالة الطلب' }),
      el('div', { class: 'shop-specs' }, [
        helpers.fact('الحالة', meta.label),
        helpers.fact('المحاولة', String(verification.attempt || 0)),
        helpers.fact('المزوّد', String(verification.providerConfigured || verification.provider || 'LOG')),
        verification.startedAt ? helpers.fact('بدأ في', ALW.format.dateTime(verification.startedAt)) : null,
        verification.submittedAt ? helpers.fact('أُرسل في', ALW.format.dateTime(verification.submittedAt)) : null,
        verification.completedAt ? helpers.fact('اكتمل في', ALW.format.dateTime(verification.completedAt)) : null,
        verification.expiresAt ? helpers.fact('ينتهي في', ALW.format.dateTime(verification.expiresAt)) : null,
        verification.rejectionReason ? helpers.fact('سبب الرفض', verification.rejectionReason) : null,
      ].filter(Boolean)),
      el('p', { class: 'shop-note', text: 'لا يوجد تحقق خارجي: المزوّد الحالي «LOG» محلي، والقرار النهائي بشري داخل المتجر.' }),
    ]));

    var actions = [];
    if (action === 'start') {
      actions.push(el('button', {
        class: 'btn btn--primary btn--lg', type: 'button', text: 'بدء التوثيق', attrs: { id: 'shop-verification-start' },
        onclick: function (event) { start(event.currentTarget, view); },
      }));
    }
    if (action === 'cancel') {
      actions.push(el('button', {
        class: 'btn btn--ghost', type: 'button', text: 'إلغاء طلب التوثيق', attrs: { id: 'shop-verification-cancel' },
        onclick: function (event) { cancel(event.currentTarget, view); },
      }));
    }
    if (!actions.length) {
      actions.push(el('a', { class: 'btn btn--secondary', href: '#/account', text: 'العودة إلى حسابي' }));
    }

    view.appendChild(el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'الإجراءات المتاحة' }),
      el('div', { class: 'shop-buy__actions' }, actions),
      status === 'PENDING' || status === 'IN_REVIEW'
        ? el('p', { class: 'shop-note', text: 'طلبك بانتظار مراجعة الفريق — لا حاجة لأي إجراء منك الآن.' })
        : null,
      status === 'REJECTED' && action === 'none'
        ? el('p', { class: 'shop-note', text: 'يمكنك إعادة المحاولة لاحقًا إن كان الخادم يسمح بذلك.' })
        : null,
    ]));
  }

  function start(button, view) {
    button.disabled = true;
    button.classList.add('btn--busy');
    var key = flow.idempotencyKey('verification', 'start:' + (ALW.session.user() && ALW.session.user().id ? ALW.session.user().id : 'me'));
    shop.api.verificationStart(key).then(function () {
      flow.clearIdempotencyKey('verification');
      shop.toast('تم بدء طلب التوثيق', 'success');
      ALW.app.refreshNotifications();
      verificationPage(view);
    }).catch(function (error) {
      button.disabled = false;
      button.classList.remove('btn--busy');
      var info = shop.cartErrorInfo(error);
      shop.toast(error && error.status === 409 ? (error.message || 'يوجد طلب توثيق قائم بالفعل.') : info.message, 'warning');
      verificationPage(view);
    });
  }

  function cancel(button, view) {
    button.disabled = true;
    shop.api.verificationCancel().then(function () {
      shop.toast('تم إلغاء طلب التوثيق', 'info');
      ALW.app.refreshNotifications();
      verificationPage(view);
    }).catch(function (error) {
      button.disabled = false;
      var info = shop.cartErrorInfo(error);
      shop.toast(error && error.status === 409 ? (error.message || 'لا يمكن الإلغاء في الحالة الحالية.') : info.message, 'warning');
      verificationPage(view);
    });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.verification = verificationPage;
  ALW.shopVerificationPage = verificationPage;
})(typeof window !== 'undefined' ? window : globalThis);
