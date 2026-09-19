/**
 * alwled shop — مكوّنات واجهة السلة (Stage 14.2): عناصر الصف، تذييل الملخّص، حالة «تسجيل الدخول مطلوب».
 * لا نداءات شبكة هنا (كل شيء عبر ALW.shopCart ⇒ ALW.shop.api ⇒ ALW.api).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var el = helpers.el;

  function authRequiredBlock(view, options) {
    var opts = options || {};
    view.appendChild(el('section', { class: 'shop-auth', attrs: { id: 'shop-auth-required' } }, [
      el('h1', { class: 'shop-auth__title', text: opts.title || 'تسجيل الدخول مطلوب' }),
      el('p', { class: 'shop-auth__sub', text: opts.text || 'سجّل دخولك لمتابعة سلة مشترياتك وإتمام الطلب.' }),
      el('div', { class: 'shop-auth__form' }, [
        el('a', { class: 'btn btn--primary btn--lg btn--block', href: shop.buildHash({ path: '/login', query: { next: opts.next || '/cart' } }), text: 'تسجيل الدخول' }),
        el('a', { class: 'btn btn--secondary btn--block', href: shop.buildHash({ path: '/register', query: { next: opts.next || '/cart' } }), text: 'إنشاء حساب' }),
        el('a', { class: 'btn btn--ghost btn--block', href: '#/products', text: 'متابعة التصفح' }),
      ]),
    ]));
  }

  function cartSummary(cart) {
    return el('div', { class: 'shop-cart__summary' }, [
      row('عدد الأصناف', String(cart.itemCount)),
      row('إجمالي الكميات', String(cart.totalQuantity)),
      el('div', { class: 'shop-cart__row shop-cart__row--total' }, [
        el('span', { text: 'المجموع الفرعي' }),
        el('strong', { text: shop.money(cart.subtotal) }),
      ]),
      el('p', { class: 'shop-note', text: 'المبالغ تُعرض كما وردت من الخادم — بلا أي حساب في المتصفح.' }),
    ]);
  }

  function row(label, value) {
    return el('div', { class: 'shop-cart__row' }, [el('span', { text: label }), el('strong', { text: value })]);
  }

  function setRowBusy(rowNode, busy) {
    rowNode.dataset.busy = busy ? 'true' : 'false';
    rowNode.classList.toggle('shop-cart__item--busy', !!busy);
    Array.prototype.forEach.call(rowNode.querySelectorAll('button, input'), function (node) {
      node.disabled = !!busy;
    });
  }

  function commitQuantity(rowNode, item, value, input) {
    var limits = shop.lineLimits(item);
    var quantity = parseInt(value, 10);
    if (!quantity || quantity < limits.min) quantity = limits.min;
    if (quantity > limits.max) {
      quantity = limits.max;
      shop.toast('الحد الأقصى للكمية في السطر هو ' + limits.max, 'warning');
    }
    input.value = String(quantity);
    if (quantity === item.quantity) return;
    setRowBusy(rowNode, true);
    ALW.shopCart.updateQuantity(item.id, quantity).then(function () {
      shop.toast('تم تحديث الكمية', 'success');
      if (ALW.app && ALW.app.renderRoute) ALW.app.renderRoute();
    }).catch(function (error) {
      var info = shop.cartErrorInfo(error);
      shop.toast(info.message, info.kind === 'network' ? 'warning' : 'danger');
      if (info.kind === 'auth') global.location.hash = shop.buildHash({ path: '/login', query: { next: '/cart' } });
      else setRowBusy(rowNode, false);
    });
  }

  function removeCartItem(rowNode, item, button) {
    if (button.dataset.confirm !== 'true') {
      button.dataset.confirm = 'true';
      button.textContent = 'تأكيد الحذف';
      global.setTimeout(function () {
        if (button.isConnected) {
          button.dataset.confirm = 'false';
          button.textContent = 'حذف';
        }
      }, 4000);
      return;
    }
    setRowBusy(rowNode, true);
    ALW.shopCart.removeItem(item.id).then(function () {
      shop.toast('تم حذف المنتج من السلة', 'info');
      if (ALW.app && ALW.app.renderRoute) ALW.app.renderRoute();
    }).catch(function (error) {
      var info = shop.cartErrorInfo(error);
      shop.toast(info.message, 'danger');
      setRowBusy(rowNode, false);
    });
  }

  function cartItemRow(item) {
    var limits = shop.lineLimits(item);
    var quantityValue = Math.max(limits.min, Math.min(limits.max, item.quantity || 1));
    var input = el('input', {
      class: 'input shop-qty__input', type: 'number', value: String(quantityValue),
      attrs: {
        min: String(limits.min), max: String(limits.max),
        'aria-label': 'كمية ' + item.name, 'data-item-id': String(item.id),
      },
    });

    var rowNode = el('article', { class: 'shop-cart__item', dataset: { itemId: String(item.id) } }, [
      el('a', { class: 'shop-cart__media', href: item.href, attrs: { 'aria-label': item.name } }, [
        item.image ? shop.imageNode(item.image, item.name, '', true) : el('div', { class: 'shop-card__placeholder', html: helpers.productIconSvg() }),
      ]),
      el('div', { class: 'shop-cart__info' }, [
        el('h3', { class: 'shop-cart__name' }, [el('a', { href: item.href, text: item.name })]),
        item.sku ? el('span', { class: 'shop-cart__sku', text: 'رمز المنتج: ' + item.sku }) : null,
        el('div', { class: 'shop-cart__prices' }, [
          el('span', { class: 'shop-price__now', text: shop.money(item.unitPrice) }),
          el('span', { class: 'shop-note', text: 'سعر الوحدة' }),
        ]),
        item.isAvailable === false
          ? el('p', { class: 'shop-cart__warning', text: 'هذا المنتج غير متوفر حاليًا — يمكنك حذفه أو تعديل الكمية لاحقًا.' })
          : null,
        (item.issues || []).map(function (issue) {
          return el('p', { class: 'shop-cart__warning', text: String(issue.message || issue) });
        }),
      ]),
      el('div', { class: 'shop-cart__controls' }, [
        el('div', { class: 'shop-qty', attrs: { role: 'group', 'aria-label': 'كمية ' + item.name } }, [
          el('button', {
            class: 'shop-qty__btn', type: 'button', text: '−',
            attrs: { 'aria-label': 'إنقاص كمية ' + item.name, disabled: item.isAvailable === false ? 'disabled' : null },
            onclick: function (event) { commitQuantity(rowNode, item, quantityValue - 1, input); event.currentTarget.blur(); },
          }),
          input,
          el('button', {
            class: 'shop-qty__btn', type: 'button', text: '+',
            attrs: { 'aria-label': 'زيادة كمية ' + item.name, disabled: item.isAvailable === false ? 'disabled' : null },
            onclick: function (event) { commitQuantity(rowNode, item, quantityValue + 1, input); event.currentTarget.blur(); },
          }),
        ]),
        el('div', { class: 'shop-cart__line' }, [
          el('span', { class: 'shop-note', text: 'إجمالي السطر' }),
          el('strong', { text: shop.money(item.lineSubtotal) }),
        ]),
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'حذف',
          attrs: { 'aria-label': 'حذف ' + item.name },
          onclick: function (event) { removeCartItem(rowNode, item, event.currentTarget); },
        }),
      ]),
    ]);

    input.addEventListener('change', function () {
      commitQuantity(rowNode, item, parseInt(input.value, 10), input);
    });
    return rowNode;
  }

  ALW.shopCartUI = {
    authRequiredBlock: authRequiredBlock,
    cartSummary: cartSummary,
    cartItemRow: cartItemRow,
    commitQuantity: commitQuantity,
    removeCartItem: removeCartItem,
    setRowBusy: setRowBusy,
  };
})(typeof window !== 'undefined' ? window : globalThis);
