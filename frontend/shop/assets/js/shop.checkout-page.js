/**
 * alwled shop — صفحة معاينة الطلب `#/checkout` + منطق «أضف إلى السلة» الحقيقي (Stage 14.2).
 * ممنوع هنا: إنشاء طلب أو دفع — الصفحة معاينة فقط (والـBackend نفسه يعلن ذلك في الاستجابة).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function checkoutPage(view) {
    shop.clear(view);
    var crumbList = [
      { label: 'الرئيسية', href: '#/' },
      { label: 'السلة', href: '#/cart' },
      { label: 'إتمام الطلب' },
    ];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, {
        title: 'تسجيل الدخول مطلوب',
        text: 'سجّل دخولك لعرض ملخّص طلبك قبل التأكيد.',
        next: '/checkout',
      });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تجهيز ملخّص الطلب…'));

    return ALW.shopCart.load().then(function () {
      return shop.api.checkoutPreview();
    }).then(function (preview) {
      var payload = preview || {};
      var items = payload.items || [];
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      view.appendChild(el('h1', { class: 'shop-section__title', text: 'ملخّص الطلب' }));
      view.appendChild(el('p', {
        class: 'shop-section__sub',
        text: 'راجع الأصناف والمجاميع، ثم أكّد الطلب. الدفع يتم لاحقًا عبر شام كاش (تحويل يدوي مع مراجعة).',
      }));

      view.appendChild(el('div', { class: 'alert alert--danger', attrs: { role: 'alert', hidden: 'hidden', id: 'shop-checkout-error', style: 'margin-bottom:12px' } }, [
        el('div', { class: 'alert__icon', text: '⚠️' }),
        el('div', {}, [el('span', { text: '' })]),
      ]));
      view.appendChild(el('div', { class: 'shop-cart' }, [
        el('div', { class: 'shop-cart__list', attrs: { id: 'shop-checkout-list' } }, items.map(function (item) {
          var product = item.product || {};
          return el('article', { class: 'shop-checkout__row' }, [
            el('div', { class: 'shop-cart__info' }, [
              el('h3', { class: 'shop-cart__name', text: product.name || 'منتج' }),
              el('span', {
                class: 'shop-cart__sku',
                text: 'الكمية: ' + item.quantity + (product.sku ? ' • ' + product.sku : ''),
              }),
              item.isAvailable === false ? el('p', { class: 'shop-cart__warning', text: 'غير متوفر حاليًا' }) : null,
            ]),
            el('div', { class: 'shop-cart__line' }, [
              el('span', { class: 'shop-note', text: shop.money(item.unitPrice) + ' × ' + item.quantity }),
              el('strong', { text: shop.money(item.lineSubtotal) }),
            ]),
          ]);
        })),
        el('aside', { class: 'shop-cart__aside' }, [
          el('h2', { class: 'shop-panel__title', text: 'الملخّص' }),
          el('div', { class: 'shop-cart__summary' }, [
            cartRow('عدد الأصناف', String(payload.itemCount || items.length)),
            cartRow('إجمالي الكميات', String(payload.totalQuantity || 0)),
            cartRow('المجموع الفرعي', shop.money(payload.subtotal)),
            (payload.discount && String(payload.discount) !== '0.00')
              ? cartRow('الخصم', shop.money(payload.discount))
              : null,
            cartRow('التوصيل', payload.shipping ? shop.money(payload.shipping) : 'يُحدَّد لاحقًا'),
            el('div', { class: 'shop-cart__row shop-cart__row--total' }, [
              el('span', { text: 'الإجمالي' }),
              el('strong', { text: shop.money(payload.total) }),
            ]),
            el('p', { class: 'shop-note', text: 'العملة: ' + (payload.currency || 'USD') + ' — كل الأرقام من الخادم.' }),
          ]),
          (payload.blockedReasons || []).map(function (reason) {
            return el('p', { class: 'shop-cart__warning', text: String(reason) });
          }),
          (payload.issues || []).map(function (issue) {
            return el('p', { class: 'shop-cart__warning', text: String(issue.message || issue) });
          }),
          el('button', {
            class: 'btn btn--primary btn--lg btn--block', type: 'button', text: 'تأكيد الطلب',
            attrs: { id: 'shop-create-order' },
            onclick: function (event) { createOrder(event.currentTarget, view, payload); },
          }),
          el('p', { class: 'shop-note', text: 'لا يُنشأ الطلب إلا بعد ضغطك على «تأكيد الطلب»، والدفع عبر شام كاش بتحويل يدوي مع مراجعة من الفريق.' }),
          el('a', { class: 'btn btn--ghost btn--block', href: '#/cart', text: 'تعديل السلة' }),
        ]),
      ]));

      if (payload.canCheckout === false) {
        view.appendChild(el('p', { class: 'shop-note', text: 'السلة تحتاج مراجعة قبل المتابعة (راجع التنبيهات أعلاه).' }));
      }
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/checkout' });
        return false;
      }
      var isConflict = info.kind === 'conflict';
      view.appendChild(shop.stateBlock(
        'error',
        isConflict ? 'لا يمكن إتمام الطلب حاليًا' : 'تعذّر تجهيز ملخّص الطلب',
        info.message,
        [
          el('a', { class: 'btn btn--primary', href: '#/cart', text: 'العودة إلى السلة' }),
          el('button', { class: 'btn btn--secondary', type: 'button', text: 'إعادة المحاولة', onclick: function () { checkoutPage(view); } }),
        ]
      ));
      return false;
    });
  }

  function cartRow(label, value) {
    return el('div', { class: 'shop-cart__row' }, [el('span', { text: label }), el('strong', { text: value })]);
  }

  /** إنشاء الطلب فعليًا: مفتاح idempotency ثابت لنفس السلة ⇒ لا طلب مزدوج عند النقر المزدوج أو إعادة المحاولة. */
  var orderInFlight = false;

  function createOrder(button, view, preview) {
    if (orderInFlight) return;
    orderInFlight = true;
    button.disabled = true;
    button.classList.add('btn--busy');

    var fingerprint = flow.cartFingerprint(ALW.shopCart.current()) + '@' + (preview && preview.subtotal ? preview.subtotal : '');
    var key = flow.idempotencyKey('order', fingerprint);

    shop.api.createOrder(key).then(function (order) {
      flow.clearIdempotencyKey('order');
      ALW.shopCart.reset();
      ALW.app.refreshShell();
      ALW.app.refreshNotifications();
      shop.toast('تم إنشاء الطلب بنجاح', 'success');
      renderSuccess(view, order || {});
    }).catch(function (error) {
      var info = shop.cartErrorInfo(error);
      var status = error && error.status;
      var message = info.message;
      if (status === 409) message = error.message || 'لا يمكن إنشاء الطلب: السلة فارغة أو تغيّر التوفّر أو الكميات.';
      if (status === 401) {
        message = 'انتهت الجلسة — سجّل الدخول ثم أعد المحاولة.';
        global.location.hash = shop.buildHash({ path: '/login', query: { next: '/checkout' } });
      }
      shop.toast(message, 'danger');
      var host = global.document.getElementById('shop-checkout-error');
      if (host) {
        host.hidden = false;
        var target = host.querySelector('span');
        if (target) target.textContent = message;
      }
    }).then(function () {
      orderInFlight = false;
      button.disabled = false;
      button.classList.remove('btn--busy');
    });
  }

  /** شاشة نجاح الطلب: كل القيم من رد الـBackend (لا رقم طلب مُختلق). */
  function renderSuccess(view, order) {
    var crumbList = [
      { label: 'الرئيسية', href: '#/' },
      { label: 'طلباتي', href: '#/orders' },
      { label: 'تم إنشاء الطلب' },
    ];
    shop.clear(view);
    view.appendChild(helpers.crumbs(crumbList));

    var status = flow.orderStatusMeta(order.status);
    view.appendChild(el('section', { class: 'shop-panel shop-success', attrs: { id: 'shop-order-success' } }, [
      el('div', { class: 'shop-success__icon', text: '✅', attrs: { 'aria-hidden': 'true' } }),
      el('h1', { class: 'shop-auth__title', text: 'تم إنشاء طلبك بنجاح' }),
      el('div', { class: 'shop-cart__summary', attrs: { style: 'margin-top:16px' } }, [
        el('div', { class: 'shop-cart__row' }, [el('span', { text: 'رقم الطلب' }), el('strong', { text: order.orderNumber || '—' })]),
        el('div', { class: 'shop-cart__row shop-cart__row--total' }, [el('span', { text: 'الإجمالي' }), el('strong', { text: shop.money(order.total) })]),
        el('div', { class: 'shop-cart__row' }, [el('span', { text: 'عدد الأصناف' }), el('strong', { text: String(order.itemCount || (order.items || []).length || 0) })]),
        el('div', { class: 'shop-cart__row' }, [el('span', { text: 'الحالة' }), el('strong', { text: status.label })]),
      ]),
      el('p', { class: 'shop-note', text: 'الخطوة التالية: إنشاء دفعة شام كاش، ثم تحويل المبلغ وإرسال مرجع الحوالة ورابط الإثبات ليُراجعها الفريق.' }),
      el('div', { class: 'shop-buy__actions', attrs: { style: 'margin-top:16px' } }, [
        el('a', { class: 'btn btn--primary', attrs: { id: 'shop-success-view-order' }, href: shop.buildHash({ path: '/orders/' + order.id }), text: 'عرض الطلب' }),
        el('a', { class: 'btn btn--secondary', href: shop.buildHash({ path: '/orders/' + order.id + '/payment' }), text: 'الدفع الآن' }),
        el('a', { class: 'btn btn--ghost', href: '#/products', text: 'متابعة التسوق' }),
      ]),
    ]));
  }

  /** إضافة منتج فعليًا للعميل المسجّل، ودعوة تسجيل الدخول للزائر (بلا أي طلب سلة للزائر). */
  function addProductToCart(button, model, qtyInput) {
    var quantity = parseInt(qtyInput && qtyInput.value, 10);
    var max = shop.MAX_LINE_QUANTITY;
    if (!quantity || quantity < 1) quantity = 1;
    if (quantity > max) quantity = max;
    if (qtyInput) qtyInput.value = String(quantity);

    if (shop.visitorState() !== 'authenticated') {
      shop.setPendingAdd(model.id, quantity); // تُنفَّذ تلقائيًا بعد تسجيل الدخول
      shop.openAuthPrompt(shop.addToCartIntent('visitor'), button);
      return;
    }

    button.disabled = true;
    button.classList.add('btn--busy');
    ALW.shopCart.add(model.id, quantity).then(function () {
      shop.toast('تمت إضافة المنتج إلى السلة', 'success');
      ALW.app.refreshShell();
    }).catch(function (error) {
      var info = shop.cartErrorInfo(error);
      shop.toast(info.message, info.kind === 'network' ? 'warning' : 'danger');
      if (info.kind === 'auth') global.location.hash = shop.buildHash({ path: '/login', query: { next: '/products/' + model.id } });
    }).then(function () {
      button.disabled = false;
      button.classList.remove('btn--busy');
    });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.checkout = checkoutPage;
  ALW.shopCheckoutPage = checkoutPage;
  ALW.shopAddToCart = addProductToCart;
})(typeof window !== 'undefined' ? window : globalThis);
