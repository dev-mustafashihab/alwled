/**
 * alwled shop — صفحة الدفع `#/orders/:id/payment` (Stage 14.3).
 * شام كاش بتحويل يدوي: إنشاء الدفعة (Idempotency-Key ثابت) → قراءة تعليمات الحساب → إرسال مرجع الحوالة + رابط الإثبات.
 * لا يوجد أي نجاح وهمي: الحالة تُعرض كما يعيدها الـBackend فقط.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function paymentPage(view, ctx) {
    var orderId = ctx && ctx.params && ctx.params[0];
    shop.clear(view);
    var crumbList = [
      { label: 'الرئيسية', href: '#/' },
      { label: 'طلباتي', href: '#/orders' },
      { label: 'الدفع' },
    ];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, { title: 'تسجيل الدخول مطلوب', text: 'سجّل دخولك لمتابعة دفع طلبك.', next: '/orders/' + orderId + '/payment' });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل حالة الدفع…'));

    function loadPayments(attempt) {
      return shop.api.payments({ page: 1, limit: 50 }).catch(function (error) {
        // لا نُظهر «لا توجد دفعة» عند فشل القراءة: إعادة محاولة واحدة ثم خطأ صريح
        if (attempt < 1 && (!error || error.status === 0 || error.status === 429 || error.status >= 500)) {
          return new Promise(function (resolve) { global.setTimeout(resolve, 1200); }).then(function () {
            return loadPayments(attempt + 1);
          });
        }
        throw error;
      });
    }

    return Promise.all([
      shop.api.order(orderId),
      loadPayments(0),
      shop.api.shamCashAccount().catch(function () { return null; }),
    ]).then(function (results) {
      var order = results[0] || {};
      var payments = (results[1] && results[1].items) || [];
      var account = results[2];
      var payment = null;
      payments.forEach(function (item) {
        if (String(item.orderId) === String(order.id) && !payment) payment = item;
      });
      render(view, crumbList, order, payment, account);
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/orders/' + orderId + '/payment' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل الدفع', info.message, [
        el('a', { class: 'btn btn--primary', href: '#/orders/' + orderId, text: 'العودة إلى الطلب' }),
      ]));
      return false;
    });
  }

  function render(view, crumbList, order, payment, account) {
    shop.clear(view);
    view.appendChild(helpers.crumbs(crumbList));
    view.appendChild(el('div', { class: 'shop-section__head' }, [
      el('div', {}, [
        el('h1', { class: 'shop-section__title', text: 'دفع الطلب' }),
        el('p', { class: 'shop-section__sub', text: (order.orderNumber || '') + ' • ' + shop.money(order.total) }),
      ]),
      el('a', { class: 'btn btn--ghost btn--sm', href: shop.buildHash({ path: '/orders/' + order.id }), text: 'تفاصيل الطلب' }),
    ]));

    if (!payment) {
      view.appendChild(el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'لم تُنشأ دفعة بعد' }),
        el('p', { class: 'shop-note', text: 'أنشئ دفعة شام كاش لهذا الطلب، ثم حوّل المبلغ وأرسل مرجع الحوالة مع رابط الإثبات.' }),
        el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
          el('button', {
            class: 'btn btn--primary btn--lg', type: 'button', text: 'إنشاء دفعة شام كاش', attrs: { id: 'shop-create-payment' },
            onclick: function (event) { createPayment(event.currentTarget, view, ctxFromOrder(order), order); },
          }),
        ]),
      ]));
      view.appendChild(instructionsPanel(account, true));
      return;
    }

    var payMeta = flow.paymentStatusMeta(payment.status);

    view.appendChild(el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'حالة الدفعة' }),
      el('div', { class: 'shop-order-row__head' }, [
        shop.badge(payMeta.label, payMeta.tone),
        shop.badge(payment.method === 'SHAM_CASH' ? 'شام كاش' : String(payment.method || ''), 'neutral'),
      ]),
      el('div', { class: 'shop-cart__summary', attrs: { style: 'margin-top:12px' } }, [
        row('المبلغ', shop.money(payment.amount)),
        row('العملة', payment.currency || order.currency || 'USD'),
        row('أُنشئت في', ALW.format.dateTime(payment.createdAt)),
        payment.transactionReference ? row('مرجع الحوالة', payment.transactionReference) : null,
        payment.submittedAt ? row('أُرسل الإثبات في', ALW.format.dateTime(payment.submittedAt)) : null,
        payment.reviewedAt ? row('رُوجع في', ALW.format.dateTime(payment.reviewedAt)) : null,
        payment.proofUrl ? row('رابط الإثبات', payment.proofUrl) : null,
        payment.proofNote ? row('ملاحظة', payment.proofNote) : null,
        payment.rejectionReason ? row('سبب الرفض', payment.rejectionReason) : null,
      ].filter(Boolean)),
      el('p', { class: 'shop-note', text: 'المبلغ والحالة من الخادم فقط — لا يمكن تعديلهما من المتجر.' }),
    ]));

    view.appendChild(instructionsPanel(account, false));

    if (payment.status === 'PENDING') {
      view.appendChild(submitPanel(payment, view, order));
    } else if (payment.status === 'PENDING_REVIEW') {
      view.appendChild(el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'قيد المراجعة' }),
        el('p', { class: 'shop-note', text: 'وصلنا إثبات التحويل، وسيراجعه فريق المتجر قبل تثبيت الدفع. لا حاجة لإرسال الإثبات مرة أخرى.' }),
      ]));
    } else if (payment.status === 'FAILED') {
      view.appendChild(el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'تم رفض الدفعة' }),
        el('p', { class: 'shop-note', text: payment.rejectionReason ? 'السبب: ' + payment.rejectionReason : 'راجع الدفعة مع فريق المتجر.' }),
      ]));
    }
  }

  function ctxFromOrder(order) {
    return { params: [String(order.id)] };
  }

  function row(label, value) {
    return el('div', { class: 'shop-cart__row' }, [el('span', { text: label }), el('strong', { text: value })]);
  }

  function instructionsPanel(account, emphasise) {
    var data = account || {};
    var configured = data.configured === true;
    if (!configured) {
      return el('section', { class: 'shop-panel', attrs: { id: 'shop-shamcash' } }, [
        el('h2', { class: 'shop-panel__title', text: 'بيانات تحويل شام كاش' }),
        el('div', { class: 'alert alert--warning', attrs: { role: 'status' } }, [
          el('div', { class: 'alert__icon', text: '⚠️' }),
          el('div', {}, [
            el('strong', { text: 'بيانات الدفع غير مهيأة حالياً' }),
            el('div', { class: 'shop-note', text: 'لم يقم المتجر بضبط بيانات محفظة شام كاش بعد. يمكنك إنشاء الدفعة، وسيظهر رقم المحفظة هنا فور تهيئته.' }),
          ]),
        ]),
      ]);
    }
    return el('section', { class: 'shop-panel', attrs: { id: 'shop-shamcash' } }, [
      el('h2', { class: 'shop-panel__title', text: 'بيانات تحويل شام كاش' }),
      el('div', { class: 'shop-specs' }, [
        data.walletNumber ? helpers.fact('رقم المحفظة', String(data.walletNumber)) : null,
        data.accountName ? helpers.fact('اسم الحساب', String(data.accountName)) : null,
        helpers.fact('العملة', String(data.currency || 'USD')),
      ].filter(Boolean)),
      data.instructions ? el('p', { class: 'shop-prose', attrs: { style: 'margin-top:12px' }, text: String(data.instructions) }) : null,
      emphasise ? null : el('p', { class: 'shop-note', text: 'حوّل المبلغ خارج الموقع ثم أرسل مرجع الحوالة ورابط الإثبات بالأسفل.' }),
    ]);
  }

  function submitPanel(payment, view, order) {
    var reference = el('input', {
      class: 'input', id: 'shop-submit-ref', required: 'required',
      attrs: { maxlength: '128', placeholder: 'مثال: SC-123456', 'aria-describedby': 'shop-submit-hint' },
    });
    var proof = el('input', {
      class: 'input', id: 'shop-submit-proof', required: 'required', type: 'url',
      attrs: { maxlength: '512', placeholder: 'الصق رابط صورة الإثبات', inputmode: 'url' },
    });
    var note = el('input', { class: 'input', id: 'shop-submit-note', attrs: { maxlength: '300' } });
    var errorBox = el('div', { class: 'alert alert--danger', attrs: { role: 'alert', hidden: 'hidden', id: 'shop-submit-error' } }, [
      el('div', { class: 'alert__icon', text: '⚠️' }),
      el('div', {}, [el('span', { text: '' })]),
    ]);
    var submit = el('button', {
      class: 'btn btn--primary btn--lg', type: 'button', text: 'إرسال إثبات التحويل',
      attrs: { id: 'shop-submit-payment' },
      onclick: function (event) { doSubmit(event.currentTarget, payment, { reference: reference, proof: proof, note: note }, errorBox, view, order); },
    });

    var form = el('section', { class: 'shop-panel' }, [
      el('h2', { class: 'shop-panel__title', text: 'إرسال إثبات التحويل' }),
      errorBox,
      el('div', { class: 'shop-auth__form' }, [
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'shop-submit-ref' }, [el('span', { text: 'مرجع الحوالة *' })]),
          reference,
          el('div', { class: 'field__hint', text: 'الرقم المرجعي الظاهر في إشعار التحويل.' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'shop-submit-proof' }, [el('span', { text: 'رابط صورة الإثبات *' })]),
          proof,
          el('div', { class: 'field__hint', id: 'shop-submit-hint', text: 'ارفع صورة الإيصال إلى مساحتك وألصق رابطها هنا (http/https). المتجر لا يستضيف الملفات حالياً، والـAPI يستقبل رابطًا فقط.' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'shop-submit-note' }, [el('span', { text: 'ملاحظة (اختياري)' })]),
          note,
        ]),
        submit,
      ]),
    ]);
    return form;
  }

  function validProofUrl(value) {
    var text = String(value || '').trim();
    if (!text || text.length > 512) return false;
    return /^https?:\/\/[^\s]+$/i.test(text);
  }

  function doSubmit(button, payment, fields, errorBox, view, order) {
    errorBox.hidden = true;
    var reference = fields.reference.value.trim();
    var proofUrl = fields.proof.value.trim();

    if (!reference) {
      showError(errorBox, 'أدخل مرجع الحوالة.');
      fields.reference.focus();
      return;
    }
    if (!validProofUrl(proofUrl)) {
      showError(errorBox, 'أدخل رابطًا صحيحًا للصورة (http/https) لا يزيد عن 512 حرفًا.');
      fields.proof.focus();
      return;
    }

    button.disabled = true;
    button.classList.add('btn--busy');
    var payload = { transactionReference: reference, proofUrl: proofUrl };
    var note = fields.note.value.trim();
    if (note) payload.proofNote = note;

    shop.api.paymentSubmit(payment.id, payload).then(function () {
      shop.toast('تم إرسال إثبات التحويل — الدفعة قيد المراجعة', 'success');
      ALW.app.refreshNotifications();
      render(view, [
        { label: 'الرئيسية', href: '#/' },
        { label: 'طلباتي', href: '#/orders' },
        { label: 'الدفع' },
      ], order, Object.assign({}, payment, {
        status: 'PENDING_REVIEW', transactionReference: reference, proofUrl: proofUrl,
        proofNote: note || null, submittedAt: new Date().toISOString(),
      }), shop.__lastShamCashAccount || null);
    }).catch(function (error) {
      var info = shop.cartErrorInfo(error);
      if (error && error.status === 409) {
        showError(errorBox, error.message || 'تم إرسال إثبات الدفع مسبقاً وهو قيد المراجعة.');
      } else if (error && error.status === 429) {
        showError(errorBox, 'عدد المحاولات كبير. انتظر قليلًا ثم أعد المحاولة.');
      } else if (error && error.status === 404) {
        showError(errorBox, 'الدفعة غير موجودة — حدّث الصفحة أو تواصل مع فريق المتجر.');
      } else {
        showError(errorBox, info.message);
      }
    }).then(function () {
      button.disabled = false;
      button.classList.remove('btn--busy');
    });
  }

  function showError(box, message) {
    box.hidden = false;
    var target = box.querySelector('span');
    if (target) target.textContent = message;
  }

  function createPayment(button, view, ctx, order) {
    button.disabled = true;
    button.classList.add('btn--busy');
    // مفتاح idempotency ثابت لكل طلب: نقرة مزدوجة أو إعادة محاولة لا تُنشئ دفعة ثانية
    var key = flow.idempotencyKey('payment-' + order.id, 'order:' + order.id + ':shamcash');
    shop.api.paymentCreate(order.id, key).then(function (payment) {
      flow.clearIdempotencyKey('payment-' + order.id);
      shop.toast('تم إنشاء الدفعة — بانتظار التحويل', 'success');
      ALW.app.refreshNotifications();
      render(view, [
        { label: 'الرئيسية', href: '#/' },
        { label: 'طلباتي', href: '#/orders' },
        { label: 'الدفع' },
      ], order, payment, shop.__lastShamCashAccount || null);
    }).catch(function (error) {
      button.disabled = false;
      button.classList.remove('btn--busy');
      var info = shop.cartErrorInfo(error);
      shop.toast(info.kind === 'conflict' ? (error.message || info.message) : info.message, 'danger');
    });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.payment = paymentPage;
  ALW.shopPaymentPage = paymentPage;
})(typeof window !== 'undefined' ? window : globalThis);
