/**
 * alwled shop — تفاصيل الطلب `#/orders/:id` (Stage 14.3): بنود، مجاميع، حالة الدفع، خط زمني حقيقي، وإلغاء.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function paymentForOrder(payments, orderId) {
    for (var index = 0; index < payments.length; index += 1) {
      if (String(payments[index].orderId) === String(orderId)) return payments[index];
    }
    return null;
  }

  function orderPage(view, ctx) {
    var id = ctx && ctx.params && ctx.params[0];
    shop.clear(view);
    var crumbList = [
      { label: 'الرئيسية', href: '#/' },
      { label: 'طلباتي', href: '#/orders' },
      { label: 'تفاصيل الطلب' },
    ];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, { title: 'تسجيل الدخول مطلوب', text: 'سجّل دخولك لعرض تفاصيل الطلب.', next: '/orders/' + id });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل تفاصيل الطلب…'));

    return Promise.all([
      shop.api.order(id),
      shop.api.payments({ page: 1, limit: 50 }).catch(function () { return null; }),  // null = فشل قراءة (لا «لا توجد دفعة»)
    ]).then(function (results) {
      var order = results[0] || {};
      var paymentsFailed = results[1] === null;
      var payment = paymentsFailed ? null : paymentForOrder((results[1] && results[1].items) || [], order.id);

      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));

      var status = flow.orderStatusMeta(order.status);
      var payMeta = payment ? flow.paymentStatusMeta(payment.status) : null;

      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: order.orderNumber || 'تفاصيل الطلب' }),
          el('p', { class: 'shop-section__sub', text: 'أُنشئ في ' + ALW.format.dateTime(order.createdAt) }),
        ]),
        el('div', { class: 'shop-order-row__head' }, [
          shop.badge(status.label, status.tone),
          payMeta ? shop.badge('الدفع: ' + payMeta.label, payMeta.tone) : null,
        ]),
      ]));

      var facts = [
        helpers.fact('الشحنة', order.shippingAmount ? shop.money(order.shippingAmount) : 'غير محدّدة'),
        helpers.fact('الخصم', order.discountAmount ? shop.money(order.discountAmount) : shop.money('0.00')),
        helpers.fact('عدد الأصناف', String(order.itemCount || (order.items || []).length || 0)),
        helpers.fact('العملة', order.currency || 'USD'),
      ];
      if (order.cancelledAt) {
        facts.push(helpers.fact('أُلغي في', ALW.format.dateTime(order.cancelledAt)));
        if (order.cancellationReason) facts.push(helpers.fact('سبب الإلغاء', order.cancellationReason));
      }

      var itemsBlock = el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'أصناف الطلب' }),
        el('div', { class: 'shop-cart__list' }, (order.items || []).map(function (item) {
          return el('article', { class: 'shop-checkout__row' }, [
            el('div', { class: 'shop-cart__info' }, [
              el('h3', { class: 'shop-cart__name', text: item.productName }),
              el('span', {
                class: 'shop-cart__sku',
                text: 'الكمية: ' + item.quantity + (item.productSku ? ' • ' + item.productSku : ''),
              }),
            ]),
            el('div', { class: 'shop-cart__line' }, [
              el('span', { class: 'shop-note', text: shop.money(item.unitPrice) + ' × ' + item.quantity }),
              el('strong', { text: shop.money(item.lineSubtotal) }),
            ]),
          ]);
        })),
      ]);

      var totalsBlock = el('aside', { class: 'shop-cart__aside' }, [
        el('h2', { class: 'shop-panel__title', text: 'المجاميع' }),
        el('div', { class: 'shop-cart__summary' }, [
          summaryRow('المجموع الفرعي', shop.money(order.subtotal)),
          summaryRow('الخصم', shop.money(order.discountAmount || '0.00')),
          summaryRow('التوصيل', order.shippingAmount && String(order.shippingAmount) !== '0.00' ? shop.money(order.shippingAmount) : 'غير محدّد'),
          el('div', { class: 'shop-cart__row shop-cart__row--total' }, [
            el('span', { text: 'الإجمالي' }),
            el('strong', { text: shop.money(order.total) }),
          ]),
        ]),
      ]);

      var paymentBlock = el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'الدفع' }),
        paymentsFailed
          ? el('p', { class: 'shop-note', text: 'تعذّر تحميل حالة الدفع الآن — أعد المحاولة.' })
          : payment
          ? el('div', {}, [
            el('div', { class: 'shop-cart__summary' }, [
              summaryRow('الطريقة', 'شام كاش'),
              summaryRow('الحالة', flow.paymentStatusMeta(payment.status).label),
              summaryRow('المبلغ', shop.money(payment.amount)),
              payment.transactionReference ? summaryRow('مرجع الحوالة', payment.transactionReference) : null,
              payment.submittedAt ? summaryRow('أُرسل الإثبات في', ALW.format.dateTime(payment.submittedAt)) : null,
              payment.reviewedAt ? summaryRow('رُوجع في', ALW.format.dateTime(payment.reviewedAt)) : null,
              payment.rejectionReason ? summaryRow('سبب الرفض', payment.rejectionReason) : null,
            ].filter(Boolean)),
            (order.status === 'CANCELLED' && payment && ['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED'].indexOf(payment.status) !== -1)
              ? el('p', { class: 'shop-note', text: 'ملاحظة: إلغاء الطلب لا يلغي الدفعة تلقائيًا — يراجع الفريق الدفعة ويقرر إلغاءها أو ردّها.' })
              : null,
            el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
              el('a', { class: 'btn btn--primary', href: shop.buildHash({ path: '/orders/' + order.id + '/payment' }), text: 'فتح صفحة الدفع' }),
            ]),
          ])
          : el('div', {}, [
            el('p', { class: 'shop-note', text: 'لم تُنشأ دفعة لهذا الطلب بعد. الدفع عبر شام كاش (تحويل يدوي مع مراجعة).' }),
            el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
              el('a', {
                class: 'btn btn--primary', attrs: { id: 'shop-order-pay' },
                href: shop.buildHash({ path: '/orders/' + order.id + '/payment' }),
                text: 'ادفع الآن (شام كاش)',
              }),
            ]),
          ]),
      ]);

      var timelineBlock = el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'حالة الطلب' }),
        timeline(flow.orderTimeline(order, payment)),
      ]);

      var cancelBlock = flow.canCancelOrder(order)
        ? el('section', { class: 'shop-panel' }, [
          el('h2', { class: 'shop-panel__title', text: 'إلغاء الطلب' }),
          el('p', { class: 'shop-note', text: 'يمكن إلغاء الطلب ما دام قيد الانتظار ولم تُثبَّت دفعته.' }),
          el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:12px' } }, [
            el('button', {
              class: 'btn btn--danger', type: 'button', text: 'إلغاء الطلب', attrs: { id: 'shop-order-cancel' },
              onclick: function () { confirmCancel(view, order); },
            }),
          ]),
        ])
        : (order.status === 'CANCELLED' ? null : el('p', { class: 'shop-note', text: 'لا يمكن إلغاء هذا الطلب في حالته الحالية — تواصل مع فريق المتجر إن لزم.' }));

      view.appendChild(el('div', { class: 'shop-cart' }, [
        el('div', { class: 'shop-cart__list' }, [itemsBlock, timelineBlock, paymentBlock, cancelBlock].filter(Boolean)),
        totalsBlock,
      ]));

      view.appendChild(el('section', { class: 'shop-panel' }, [
        el('h2', { class: 'shop-panel__title', text: 'بيانات الطلب' }),
        el('div', { class: 'shop-specs' }, facts),
      ]));
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/orders/' + id });
        return false;
      }
      if (error && error.status === 404) {
        view.appendChild(shop.stateBlock('empty', 'الطلب غير موجود', 'هذا الطلب غير متاح لحسابك.', [
          el('a', { class: 'btn btn--primary', href: '#/orders', text: 'عرض طلباتي' }),
        ]));
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل الطلب', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { orderPage(view, ctx); } }),
      ]));
      return false;
    });
  }

  function summaryRow(label, value) {
    return el('div', { class: 'shop-cart__row' }, [el('span', { text: label }), el('strong', { text: value })]);
  }

  function timeline(steps) {
    if (!steps.length) return el('p', { class: 'shop-note', text: 'لا توجد أحداث بعد.' });
    return el('ol', { class: 'shop-timeline' }, steps.map(function (step) {
      return el('li', { class: 'shop-timeline__item shop-timeline__item--' + (step.done ? 'done' : 'current') }, [
        el('span', { class: 'shop-timeline__dot', attrs: { 'aria-hidden': 'true' } }),
        el('div', {}, [
          el('strong', { text: step.label }),
          step.at ? el('div', { class: 'shop-note', text: ALW.format.dateTime(step.at) }) : null,
        ]),
      ]);
    }));
  }

  function confirmCancel(view, order) {
    var doc = global.document;
    var dialog = el('div', { class: 'modal', attrs: { role: 'presentation' } }, [
      el('div', { class: 'modal__backdrop', dataset: { close: 'true' } }),
      el('div', { class: 'modal__panel modal--sm', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shop-cancel-title' } }, [
        el('div', { class: 'modal__head' }, [
          el('h2', { class: 'modal__title', id: 'shop-cancel-title', text: 'تأكيد إلغاء الطلب' }),
          el('button', { class: 'modal__close', type: 'button', text: '✕', attrs: { 'aria-label': 'إغلاق', dataset: { close: 'true' } } }),
        ]),
        el('div', { class: 'modal__body' }, [
          el('p', { class: 'shop-note', text: 'سيُلغى الطلب ' + (order.orderNumber || '') + ' ولن يُستأنف. هل أنت متأكد؟' }),
          el('div', { class: 'field', attrs: { style: 'margin-top:12px' } }, [
            el('label', { class: 'field__label', for: 'shop-cancel-reason' }, [el('span', { text: 'سبب الإلغاء (اختياري)' })]),
            el('input', { class: 'input', id: 'shop-cancel-reason', attrs: { maxlength: '200' } }),
          ]),
          el('div', { class: 'alert alert--danger', attrs: { role: 'alert', hidden: 'hidden', id: 'shop-cancel-error' } }, [
            el('div', { class: 'alert__icon', text: '⚠️' }),
            el('div', {}, [el('span', { text: '' })]),
          ]),
        ]),
        el('div', { class: 'modal__foot' }, [
          el('button', {
            class: 'btn btn--danger', type: 'button', text: 'نعم، ألغِ الطلب', attrs: { id: 'shop-cancel-confirm' },
            onclick: function (event) { doCancel(event.currentTarget, dialog, order, view); },
          }),
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'رجوع', dataset: { close: 'true' } }),
        ]),
      ]),
    ]);

    var lastFocus = doc.activeElement;
    function close() {
      dialog.remove();
      doc.removeEventListener('keydown', onKey, true);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    dialog.addEventListener('click', function (event) {
      if (event.target && event.target.dataset && event.target.dataset.close) close();
    });
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(dialog);
    var panel = dialog.querySelector('.modal__panel');
    var focusable = panel.querySelector('input, button');
    if (focusable) focusable.focus();
  }

  function doCancel(button, dialog, order, view) {
    var reasonInput = dialog.querySelector('#shop-cancel-reason');
    var errorBox = dialog.querySelector('#shop-cancel-error');
    button.disabled = true;
    shop.api.orderCancel(order.id, reasonInput && reasonInput.value.trim() ? reasonInput.value.trim() : undefined)
      .then(function () {
        dialog.remove();
        shop.toast('تم إلغاء الطلب', 'info');
        orderPage(view, { params: [String(order.id)] });
      })
      .catch(function (error) {
        button.disabled = false;
        var info = shop.cartErrorInfo(error);
        var target = errorBox.querySelector('span');
        if (target) target.textContent = info.kind === 'conflict'
          ? (error.message || 'لا يمكن إلغاء الطلب في حالته الحالية.')
          : info.message;
        errorBox.hidden = false;
      });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.order = orderPage;
  ALW.shopOrderPage = orderPage;
})(typeof window !== 'undefined' ? window : globalThis);
