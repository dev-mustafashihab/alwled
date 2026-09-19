/**
 * alwled shop — طبقة السلة (Stage 14.2).
 * كل نداءات الشبكة تمرّ من ALW.shop.api ⇒ ALW.api المركزي. لا fetch هنا.
 * مصدر الحقيقة للسلة والأسعار هو الـBackend دائمًا: لا نخزّن سلة في localStorage ولا نحسب مبالغ محليًا.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;

  var state = {
    cart: shop.cartModel(null),
    loaded: false,
    loading: false,
    lastError: null,
    listeners: [],
  };

  function emit() {
    state.listeners.slice().forEach(function (fn) {
      try {
        fn(state.cart);
      } catch (error) {
        /* a listener must never break the cart */
      }
    });
  }

  function onChange(fn) {
    state.listeners.push(fn);
    return function () {
      state.listeners = state.listeners.filter(function (item) { return item !== fn; });
    };
  }

  function apply(payload) {
    state.cart = shop.cartModel(payload);
    state.loaded = true;
    state.lastError = null;
    emit();
    return state.cart;
  }

  function current() {
    return state.cart;
  }

  function handle(error) {
    var info = shop.cartErrorInfo(error);
    state.lastError = info;
    if (info.kind === 'auth') {
      // الـAPI client يحاول refresh مرة واحدة؛ وإذا فشل نُعيد الواجهة إلى حالة زائر بلا رسالة تقنية.
      if (ALW.session && ALW.session.expire) ALW.session.expire();
      emit();
    }
    throw error;
  }

  function load() {
    if (shop.visitorState() !== 'authenticated') {
      return Promise.resolve(apply(null));
    }
    state.loading = true;
    return shop.api.cart().then(function (payload) {
      state.loading = false;
      return apply(payload);
    }).catch(function (error) {
      state.loading = false;
      return handle(error);
    });
  }

  function add(productId, quantity) {
    if (shop.visitorState() !== 'authenticated') {
      var intent = shop.addToCartIntent('visitor');
      return Promise.reject(Object.assign(new Error(intent.message), { status: 401, code: 'unauthorized', intent: intent }));
    }
    return shop.api.cartAdd(productId, quantity).then(apply).catch(handle);
  }

  function updateQuantity(itemId, quantity) {
    return shop.api.cartUpdate(itemId, quantity).then(apply).catch(handle);
  }

  function removeItem(itemId) {
    return shop.api.cartRemove(itemId).then(apply).catch(handle);
  }

  function clear() {
    return shop.api.cartClear().then(apply).catch(handle);
  }

  function reset() {
    state.cart = shop.cartModel(null);
    state.loaded = false;
    state.lastError = null;
    emit();
  }

  /**
   * إتمام نيّة «أضف إلى السلة» التي أُخذت قبل تسجيل الدخول (بلا أي fake success).
   * يعيد { added: bool, productId, quantity } أو null إن لم تكن هناك نيّة.
   */
  function completePendingAdd() {
    var pending = shop.takePendingAdd();
    if (!pending) return Promise.resolve(null);
    return add(pending.productId, pending.quantity).then(function () {
      return { added: true, productId: pending.productId, quantity: pending.quantity };
    }).catch(function (error) {
      return { added: false, productId: pending.productId, quantity: pending.quantity, error: shop.cartErrorInfo(error) };
    });
  }

  var cart = {
    load: load,
    add: add,
    updateQuantity: updateQuantity,
    removeItem: removeItem,
    clear: clear,
    reset: reset,
    current: current,
    onChange: onChange,
    completePendingAdd: completePendingAdd,
    isLoaded: function () { return state.loaded; },
    isLoading: function () { return state.loading; },
    lastError: function () { return state.lastError; },
    totalQuantity: function () { return state.cart.totalQuantity; },
    MAX_LINE_QUANTITY: shop.MAX_LINE_QUANTITY,
  };

  ALW.shopCart = cart;
  if (typeof module !== 'undefined' && module.exports) module.exports = cart;
})(typeof window !== 'undefined' ? window : globalThis);
