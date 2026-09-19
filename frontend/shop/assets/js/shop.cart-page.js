/**
 * alwled shop — صفحة السلة `#/cart` (Stage 14.2). الزائر يرى دعوة تسجيل الدخول بلا أي نداء للسلة.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var el = helpers.el;

  function cartPage(view) {
    shop.clear(view);
    var crumbList = [
      { label: 'الرئيسية', href: '#/' },
      { label: 'السلة' },
    ];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, {
        title: 'تسجيل الدخول مطلوب',
        text: 'سجّل دخولك لعرض سلة مشترياتك ومتابعة الطلب. تصفّح المنتجات متاح بدون حساب.',
        next: '/cart',
      });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل سلة مشترياتك…'));

    return ALW.shopCart.load().then(function (cart) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: 'سلة المشتريات' }),
          el('p', {
            class: 'shop-section__sub',
            text: cart.itemCount ? 'راجع الكميات قبل متابعة الطلب.' : 'لا توجد منتجات في سلتك حتى الآن.',
          }),
        ]),
        cart.itemCount
          ? el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', text: 'تفريغ السلة',
            attrs: { id: 'shop-cart-clear' },
            onclick: function (event) { clearCart(event.currentTarget, view); },
          })
          : null,
      ]));

      if (!cart.itemCount) {
        view.appendChild(shop.stateBlock('empty', 'سلتك فارغة', 'أضف منتجات من المتجر لتظهر هنا.', [
          el('a', { class: 'btn btn--primary', href: '#/products', text: 'تصفّح المنتجات' }),
        ]));
        return false;
      }

      view.appendChild(el('div', { class: 'shop-cart' }, [
        el('div', { class: 'shop-cart__list', attrs: { id: 'shop-cart-list' } }, cart.items.map(ui.cartItemRow)),
        el('aside', { class: 'shop-cart__aside' }, [
          el('h2', { class: 'shop-panel__title', text: 'ملخّص السلة' }),
          ui.cartSummary(cart),
          el('a', {
            class: 'btn btn--primary btn--lg btn--block', href: '#/checkout',
            attrs: { id: 'shop-go-checkout' },
            text: 'متابعة إلى إتمام الطلب',
          }),
          cart.isCheckoutReady ? null : el('p', { class: 'shop-note', text: 'توجد أصناف تحتاج مراجعة قبل إتمام الطلب — راجع التنبيهات أعلاه.' }),
          el('a', { class: 'btn btn--ghost btn--block', href: '#/products', text: 'إضافة منتجات أخرى' }),
        ]),
      ]));
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/cart' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل السلة', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { cartPage(view); } }),
        el('a', { class: 'btn btn--secondary', href: '#/products', text: 'تصفّح المنتجات' }),
      ]));
      return false;
    });
  }

  function clearCart(button, view) {
    if (button.dataset.confirm !== 'true') {
      button.dataset.confirm = 'true';
      button.textContent = 'تأكيد التفريغ';
      global.setTimeout(function () {
        if (button.isConnected) {
          button.dataset.confirm = 'false';
          button.textContent = 'تفريغ السلة';
        }
      }, 4000);
      return;
    }
    button.disabled = true;
    ALW.shopCart.clear().then(function () {
      shop.toast('تم تفريغ السلة', 'info');
      cartPage(view);
    }).catch(function (error) {
      button.disabled = false;
      shop.toast(shop.cartErrorInfo(error).message, 'danger');
    });
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.cart = cartPage;
  ALW.shopCartPage = cartPage;
})(typeof window !== 'undefined' ? window : globalThis);
