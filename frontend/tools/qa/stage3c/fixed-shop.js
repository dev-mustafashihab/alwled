/**
 * alwled shop — الطبقة الأساسية للمتجر العام.
 * - لا يحتوي أي سرّ، ولا يتصل بالـBackend إلا عبر ALW.api المركزي (لا fetch هنا إطلاقًا).
 * - يعمل للزائر:التصفح/search/التصنيفات/العلامات/تفاصيل منتج بلا تسجيل.
 * - Add to Cart للزائر = دعوة لتسجيل الدخول/إنشاء حساب فقط (لا يُرسل أي طلب سلة).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});

  /* ------------------------------------------------------------------ DOM helpers */
  function el(tag, options, children) {
    var node = (global.document || document).createElement(tag);
    var opts = options || {};
    Object.keys(opts).forEach(function (key) {
      var value = opts[key];
      if (value === null || value === undefined) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') {
        Object.keys(value).forEach(function (dataKey) {
          node.dataset[dataKey] = value[dataKey];
        });
      } else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'attrs') {
        Object.keys(value).forEach(function (attrKey) {
          if (value[attrKey] !== null && value[attrKey] !== undefined) node.setAttribute(attrKey, value[attrKey]);
        });
      } else node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      appendChild(node, child);
    });
    return node;
  }

  function appendChild(node, child) {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) { appendChild(node, item); });
      return;
    }
    node.appendChild(typeof child === 'string' ? (global.document || document).createTextNode(child) : child);
  }

  function clear(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* ------------------------------------------------------------------ routing (pure) */
  var ROUTES = [
    { name: 'home', regex: /^\/?$/ },
    { name: 'products', regex: /^\/products\/?$/ },
    { name: 'product', regex: /^\/products\/([^/]+)\/?$/ },
    { name: 'login', regex: /^\/login\/?$/ },
    { name: 'register', regex: /^\/register\/?$/ },
    { name: 'cart', regex: /^\/cart\/?$/ },
    { name: 'checkout', regex: /^\/checkout\/?$/ },
    { name: 'account', regex: /^\/account\/?$/, },
    { name: 'orders', regex: /^\/orders\/?$/ },
    { name: 'order', regex: /^\/orders\/([^/]+)\/?$/ },
    { name: 'payment', regex: /^\/orders\/([^/]+)\/payment\/?$/ },
    { name: 'notifications', regex: /^\/notifications\/?$/ },
    { name: 'verification', regex: /^\/verification\/?$/ },
  ];

  var ALLOWED_PRODUCT_PARAMS = ['page', 'limit', 'search', 'categoryId', 'brandId', 'sortBy', 'sortOrder', 'minPrice', 'maxPrice', 'isFeatured', 'inStock', 'offers', 'includeInventory'];
  var ALLOWED_SORT = ['createdAt', 'price', 'name'];
  var ALLOWED_ORDER = ['asc', 'desc'];

  function parseHash(rawHash) {
    var raw = String(rawHash || '').replace(/^#/, '');
    if (!raw) return { name: 'home', path: '/', query: {}, params: [] };
    var parts = raw.split('?');
    var path = parts[0] || '/';
    if (path.charAt(0) !== '/') path = '/' + path;
    var query = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      var key = decodeURIComponent(kv[0] || '');
      if (!key) return;
      query[key] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    for (var index = 0; index < ROUTES.length; index += 1) {
      var match = ROUTES[index].regex.exec(path);
      if (match) {
        return { name: ROUTES[index].name, path: path, query: query, params: match.slice(1) };
      }
    }
    return { name: 'notfound', path: path, query: query, params: [] };
  }

  function buildHash(state) {
    var next = state || {};
    var path = next.path || '/';
    if (path.charAt(0) !== '/') path = '/' + path;
    var query = next.query || {};
    var pairs = [];
    Object.keys(query).forEach(function (key) {
      var value = query[key];
      if (value === null || value === undefined || value === '') return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return '#' + path + (pairs.length ? '?' + pairs.join('&') : '');
  }

  /* PHASE 3 · STEP 3C — تحويل آمن لقيم السعر وفق عقد الـAPI:
     DTO يقبل minPrice/maxPrice كأرقام @Min(0) ويرفض غير الرقمي/السالب بـ400 ⇒ نُسقط القيم غير الصالحة هنا ولا نرسلها. */
  function priceNumber(value) {
    if (value === null || value === undefined) return null;
    var raw = String(value).trim();
    if (!raw) return null;
    var number = Number(raw);
    if (!isFinite(number) || number < 0) return null;
    return number;
  }

  /**
   * يبني معاملات طلب المنتجات **المدعومة فقط** — لا نخترع أي معامل غير موجود في العقد.
   */
  function buildProductQuery(filters) {
    var input = filters || {};
    var query = {};
    var page = parseInt(input.page, 10);
    var limit = parseInt(input.limit, 10);
    query.page = page > 0 ? page : 1;
    query.limit = limit > 0 && limit <= 48 ? limit : 12;
    if (input.search) query.search = String(input.search).trim();
    if (input.categoryId) query.categoryId = input.categoryId;
    if (input.brandId) query.brandId = input.brandId;
    var minPrice = priceNumber(input.minPrice);
    var maxPrice = priceNumber(input.maxPrice);
    if (minPrice !== null) query.minPrice = minPrice;
    if (maxPrice !== null) query.maxPrice = maxPrice;
    if (ALLOWED_SORT.indexOf(input.sortBy) !== -1) {
      query.sortBy = input.sortBy;
      query.sortOrder = ALLOWED_ORDER.indexOf(input.sortOrder) !== -1 ? input.sortOrder : 'desc';
    }
    return query;
  }

  function pickQuery(source, keys) {
    var out = {};
    keys.forEach(function (key) {
      var value = (source || {})[key];
      if (value !== null && value !== undefined && value !== '') out[key] = value;
    });
    return out;
  }

  /* ------------------------------------------------------------------ money / models (pure) */
  function priceValue(raw) {
    // القيم تأتي من الـBackend كنصّ Decimal — لا حساب floating point في الواجهة.
    return String(raw === null || raw === undefined ? '0' : raw);
  }

  function money(raw) {
    var formatter = ALW.format && ALW.format.money;
    var currency = (ALW.config && ALW.config.currencyFallback) || 'USD';
    if (typeof formatter === 'function') return formatter(priceValue(raw), currency);
    return priceValue(raw);
  }

  function productCardModel(product) {
    var item = product || {};
    var image = null;
    if (item.primaryImage && (item.primaryImage.url || item.primaryImage.path)) {
      image = item.primaryImage.url || item.primaryImage.path;
    } else if (Array.isArray(item.images) && item.images.length) {
      var first = item.images[0];
      image = typeof first === 'string' ? first : first && (first.url || first.path);
    }
    return {
      id: item.id,
      name: item.name || '',
      sku: item.sku || '',
      shortDescription: item.shortDescription || '',
      price: item.price,
      compareAtPrice: item.compareAtPrice || null,
      hasDiscount: item.hasDiscount === true,
      discountPercentage: item.discountPercentage || 0,
      brand: (item.brand && item.brand.name) || '',
      category: (item.category && item.category.name) || '',
      image: image,
      // الحالة تُعرض فقط إذا أعاد الـBackend قيمة منطقية فعلية (بلا تخمين)
      inStock: typeof item.inStock === 'boolean' ? item.inStock : null,
      href: buildHash({ path: '/products/' + item.id }),
    };
  }

  /**
   * قرار زر «أضف إلى السلة» — الزائر لا يُرسل أي طلب سلة، بل يُدعى لتسجيل الدخول.
   */
  function addToCartIntent(stateName) {
    if (stateName !== 'authenticated') {
      return {
        action: 'auth-required',
        title: 'سجّل الدخول لإضافة المنتج إلى السلة',
        message: 'حتى تضيف المنتج إلى السلة، سجّل الدخول إلى حسابك أو أنشئ حسابًا جديدًا.',
      };
    }
    return {
      action: 'cart-add',
      title: 'أضف إلى السلة',
      message: 'سيُضاف المنتج إلى سلتك مباشرة.',
    };
  }

  /* ------------------------------------------------------------------ cart helpers (pure) */
  var MAX_LINE_QUANTITY = 20; // الحد الفعلي في الـBackend: 20 للكمية في السطر الواحد

  function cartModel(payload) {
    var cart = payload || {};
    return {
      id: cart.id || null,
      items: (cart.items || []).map(function (item) {
        return {
          id: item.id,
          productId: item.productId,
          name: (item.product && item.product.name) || 'منتج',
          sku: (item.product && item.product.sku) || '',
          image: (item.product && item.product.primaryImage && (item.product.primaryImage.url || item.product.primaryImage.path)) || null,
          quantity: Number(item.quantity) || 0,
          unitPrice: String(item.unitPrice === undefined ? (item.product && item.product.price) || '0' : item.unitPrice),
          lineSubtotal: String(item.lineSubtotal === undefined ? '0' : item.lineSubtotal),
          availableQuantity: item.availableQuantity === undefined ? null : Number(item.availableQuantity),
          isAvailable: item.isAvailable !== false,
          issues: item.issues || [],
          href: buildHash({ path: '/products/' + item.productId }),
        };
      }),
      itemCount: Number(cart.itemCount) || 0,
      totalQuantity: Number(cart.totalQuantity) || 0,
      subtotal: String(cart.subtotal === undefined ? '0.00' : cart.subtotal),
      currency: cart.currency || (ALW.config && ALW.config.currencyFallback) || 'USD',
      isCheckoutReady: cart.isCheckoutReady === true,
      issues: cart.issues || [],
    };
  }

  /** حدود الكمية في السطر: 1 … min(20, المتاح) — لا نرسل قيمة غير صالحة للخادم. */
  function lineLimits(item) {
    var max = MAX_LINE_QUANTITY;
    if (item && item.availableQuantity !== null && item.availableQuantity !== undefined) {
      max = Math.min(max, Number(item.availableQuantity));
    }
    if (!(max >= 1)) max = 1;
    return { min: 1, max: max, clamped: !!(item && item.quantity > max) };
  }

  /** تصنيف أخطاء السلة/الـcheckout إلى رسائل عربية واضحة (بلا أي رسالة تقنية للمستخدم). */
  function cartErrorInfo(error) {
    var status = (error && error.status) || 0;
    var code = (error && error.code) || '';
    var serverMessage = (error && error.message) || '';
    if (code === 'network' || status === 0) {
      return { kind: 'network', message: 'تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة.', retry: true };
    }
    if (status === 401) {
      return { kind: 'auth', message: 'انتهت الجلسة. سجّل الدخول لمتابعة سلة مشترياتك.', retry: false };
    }
    if (status === 404) {
      return { kind: 'missing', message: serverMessage || 'هذا العنصر لم يعد متاحًا في المتجر.', retry: true };
    }
    if (status === 409) {
      return { kind: 'conflict', message: serverMessage || 'لا يمكن تنفيذ العملية بسبب تعارض في الكمية أو التوفّر.', retry: true };
    }
    if (status === 400 || status === 422) {
      var fieldMessage = (error && error.fields && error.fields.length && error.fields[0].message) || '';
      return { kind: 'invalid', message: translateValidation(fieldMessage) || 'تحقّق من القيم المُدخلة.', retry: false };
    }
    if (status === 429) {
      return { kind: 'throttled', message: 'عدد الطلبات كبير. انتظر قليلًا ثم أعد المحاولة.', retry: true };
    }
    return { kind: 'server', message: serverMessage || 'حدث خطأ غير متوقع. أعد المحاولة.', retry: true };
  }

  function translateValidation(message) {
    if (!message) return '';
    if (/quantity must not be less than 1/i.test(message)) return 'الكمية يجب أن تكون 1 على الأقل.';
    if (/must not be greater than/i.test(message)) return 'الكمية أكبر من الحد المسموح.';
    if (/should not be less than 1/i.test(message)) return 'الكمية يجب أن تكون 1 على الأقل.';
    return '';
  }

  /** بوابة المسارات: السلة والـcheckout تحتاج جلسة عميل. */
  function routeGuard(routeName, state) {
    if (routeName !== 'cart' && routeName !== 'checkout') return 'allow';
    return state === 'authenticated' ? 'allow' : 'auth-required';
  }

  /* ------------------------------------------------------------------ pending add (intent only, no secrets) */
  var PENDING_KEY = 'alwled.shop.pendingAdd';

  function setPendingAdd(productId, quantity) {
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ productId: Number(productId), quantity: Number(quantity) || 1 }));
      }
    } catch (error) {
      /* storage blocked — the intent is then lost, which is acceptable */
    }
  }

  function takePendingAdd() {
    try {
      if (!global.sessionStorage) return null;
      var raw = global.sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      global.sessionStorage.removeItem(PENDING_KEY);
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.productId) return null;
      return { productId: Number(parsed.productId), quantity: Number(parsed.quantity) || 1 };
    } catch (error) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ API (all through ALW.api) */
  var api = {
    products: function (filters) {
      return ALW.api.get('/products', { query: buildProductQuery(filters) });
    },
    product: function (id) {
      return ALW.api.get('/products/' + encodeURIComponent(String(id)));
    },
    categories: function () {
      return ALW.api.get('/categories', { query: { limit: 48 } });
    },
    brands: function () {
      return ALW.api.get('/brands', { query: { limit: 48 } });
    },
    login: function (phone, password) {
      return ALW.api.post('/auth/login', { phone: phone, password: password }, { skipAuth: true });
    },
    register: function (payload) {
      return ALW.api.post('/auth/register', payload, { skipAuth: true });
    },
    refresh: function (refreshToken) {
      return ALW.api.post('/auth/refresh', { refreshToken: refreshToken }, { skipAuth: true });
    },
    logout: function (refreshToken) {
      return ALW.api.post('/auth/logout', refreshToken ? { refreshToken: refreshToken } : {});
    },
    // ---- السلة (كلها ترجع السلة المحدَّثة كاملة من الـBackend) ----
    cart: function () {
      return ALW.api.get('/cart');
    },
    cartAdd: function (productId, quantity) {
      return ALW.api.post('/cart/items', { productId: Number(productId), quantity: Number(quantity) });
    },
    cartUpdate: function (itemId, quantity) {
      return ALW.api.patch('/cart/items/' + encodeURIComponent(String(itemId)), { quantity: Number(quantity) });
    },
    cartRemove: function (itemId) {
      return ALW.api.del('/cart/items/' + encodeURIComponent(String(itemId)));
    },
    cartClear: function () {
      return ALW.api.del('/cart');
    },
    checkoutPreview: function () {
      return ALW.api.post('/checkout/preview', {});
    },
    // ---- الطلبات ----
    createOrder: function (idempotencyKey) {
      return ALW.api.post('/orders', {}, { headers: { 'Idempotency-Key': idempotencyKey } });
    },
    orders: function (query) {
      return ALW.api.get('/orders', { query: query || {} });
    },
    order: function (id) {
      return ALW.api.get('/orders/' + encodeURIComponent(String(id)));
    },
    orderCancel: function (id, reason) {
      return ALW.api.post('/orders/' + encodeURIComponent(String(id)) + '/cancel', reason ? { reason: reason } : {});
    },
    // ---- الدفعات ----
    payments: function (query) {
      return ALW.api.get('/payments', { query: query || {} });
    },
    payment: function (id) {
      return ALW.api.get('/payments/' + encodeURIComponent(String(id)));
    },
    paymentCreate: function (orderId, idempotencyKey) {
      return ALW.api.post('/payments', { orderId: Number(orderId), method: 'SHAM_CASH' }, { headers: { 'Idempotency-Key': idempotencyKey } });
    },
    shamCashAccount: function () {
      return ALW.api.get('/payments/sham-cash/account');
    },
    paymentSubmit: function (id, payload) {
      return ALW.api.post('/payments/' + encodeURIComponent(String(id)) + '/submit', payload);
    },
    // ---- الإشعارات ----
    notifications: function (query) {
      return ALW.api.get('/notifications', { query: query || {} });
    },
    unreadCount: function () {
      return ALW.api.get('/notifications/unread-count');
    },
    notificationRead: function (id) {
      return ALW.api.post('/notifications/' + encodeURIComponent(String(id)) + '/read', {});
    },
    notificationsReadAll: function () {
      return ALW.api.post('/notifications/read-all', {});
    },
    notificationPreferences: function () {
      return ALW.api.get('/notifications/preferences');
    },
    notificationPreferenceUpdate: function (type, inAppEnabled) {
      return ALW.api.patch('/notifications/preferences', { type: type, inAppEnabled: inAppEnabled });
    },
    // ---- الحساب ----
    me: function () {
      return ALW.api.get('/users/me');
    },
    profileUpdate: function (body) {
      return ALW.api.patch('/users/me', body);
    },
    changePassword: function (body) {
      return ALW.api.post('/auth/change-password', body);
    },
    sessions: function () {
      return ALW.api.get('/auth/sessions');
    },
    // ---- التحقق ----
    verification: function () {
      return ALW.api.get('/verification/me');
    },
    verificationStart: function (idempotencyKey) {
      return ALW.api.post('/verification/start', { locale: 'ar', acceptedTerms: true }, { headers: { 'Idempotency-Key': idempotencyKey } });
    },
    verificationCancel: function () {
      return ALW.api.post('/verification/cancel', {});
    },
  };

  /* ------------------------------------------------------------------ UI primitives */
  function toast(message, tone) {
    var host = (global.document || document).getElementById('shop-toasts');
    if (!host) return null;
    var node = el('div', { class: 'toast toast--' + (tone || 'info'), attrs: { role: 'status' } }, [
      el('div', { class: 'toast__body', text: message }),
    ]);
    host.appendChild(node);
    global.setTimeout(function () {
      node.classList.add('toast--leaving');
      global.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 260);
    }, 4200);
    return node;
  }

  function stateBlock(kind, title, text, actions) {
    var icon = kind === 'error' ? '⚠️' : kind === 'empty' ? '📦' : '⏳';
    return el('div', { class: 'state state--' + (kind === 'loading' ? 'compact' : kind) }, [
      el('div', { class: 'state__icon', text: icon }),
      el('div', { class: 'state__title', text: title }),
      text ? el('div', { class: 'state__text', text: text }) : null,
      actions && actions.length
        ? el('div', { class: 'shop-buy__actions', attrs: { style: 'justify-content:center;margin-top:12px' } }, actions)
        : null,
    ]);
  }

  function loadingBlock(label) {
    return el('div', { class: 'shop-section', attrs: { 'aria-busy': 'true' } }, [
      el('div', { class: 'skeleton skeleton--title', attrs: { style: 'width:220px' } }),
      el('div', { class: 'shop-grid' }, [0, 1, 2, 3].map(function () {
        return el('div', { class: 'skeleton skeleton--card', attrs: { style: 'height:320px' } });
      })),
      label ? el('p', { class: 'shop-note', text: label }) : null,
    ]);
  }

  function productIcon() {
    return el('div', { class: 'shop-card__placeholder', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="lucide lucide-package"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/></svg>' });
  }

  function imageNode(src, alt, classNames, lazy) {
    return el('img', {
      class: classNames || '',
      src: src,
      alt: alt || '',
      loading: lazy === false ? 'eager' : 'lazy',
      attrs: { decoding: 'async' },
    });
  }

  function badge(text, tone) {
    return el('span', { class: 'badge badge--' + (tone || 'neutral') + ' badge--sm', text: text });
  }

  function stockBadge(inStock) {
    if (inStock === null || inStock === undefined) return null; // لا بيانات مخزون — لا شِعار
    return inStock ? badge('متوفر', 'success') : badge('غير متوفر', 'danger');
  }

  function productCard(product) {
    var model = productCardModel(product);
    var media = model.image
      ? imageNode(model.image, model.name, '', true)
      : productIcon();
    var flags = [];
    if (model.hasDiscount && model.discountPercentage) flags.push(badge('-' + model.discountPercentage + '%', 'danger'));
    return el('article', { class: 'shop-card', dataset: { productId: String(model.id) } }, [
      el('a', { class: 'shop-card__media', href: model.href, attrs: { 'aria-label': model.name } }, [
        media,
        flags.length ? el('div', { class: 'shop-card__flags' }, flags) : null,
      ]),
      el('div', { class: 'shop-card__body' }, [
        el('div', { class: 'shop-card__meta' }, [
          model.brand ? el('span', { text: model.brand }) : null,
          model.category ? el('span', { text: model.category }) : null,
          model.sku ? el('span', { text: 'رمز: ' + model.sku }) : null,
        ]),
        el('h3', { class: 'shop-card__name' }, [el('a', { href: model.href, text: model.name })]),
        model.shortDescription ? el('p', { class: 'shop-card__desc', text: model.shortDescription }) : null,
        el('div', { class: 'shop-card__foot' }, [
          el('div', { class: 'shop-price' }, [
            el('span', { class: 'shop-price__now', text: money(model.price) }),
            model.compareAtPrice ? el('span', { class: 'shop-price__was', text: money(model.compareAtPrice) }) : null,
          ]),
          model.hasDiscount && model.discountPercentage
            ? badge('وفّر ' + model.discountPercentage + '%', 'success')
            : stockBadge(model.inStock),
        ]),
        el('div', { class: 'shop-card__actions' }, [
          el('button', {
            class: 'btn btn--primary shop-card__add',
            type: 'button',
            text: model.inStock === false ? 'غير متوفر' : 'أضف للسلة',
            attrs: {
              'data-product-id': String(model.id),
              'aria-label': (model.inStock === false ? '' : 'أضف ') + model.name +
                (model.inStock === false ? ' — غير متوفر' : ' إلى السلة'),
              disabled: model.inStock === false ? 'disabled' : null,
            },
            onclick: model.inStock !== false
              ? function () {
                  var btn = this;
                  if (!ALW.shopAddToCart) return;
                  ALW.shopAddToCart(btn, model, { value: 1 });
                }
              : null,
          }),
          el('a', {
            class: 'btn btn--ghost shop-card__details',
            href: model.href,
            text: 'عرض التفاصيل',
            attrs: { 'aria-label': 'عرض تفاصيل ' + model.name },
          }),
        ]),
      ]),
    ]);
  }

  /* ------------------------------------------------------------------ cart CTA (no cart flow in 14.1) */
  function handleAddToCart(triggerNode, model, quantity) {
    var intent = addToCartIntent(visitorState());
    if (intent.action === 'auth-required') {
      openAuthPrompt(intent, triggerNode);
      return intent;
    }
    if (ALW.shopAddToCart && model) {
      ALW.shopAddToCart(triggerNode, model, { value: quantity || 1 });
      return intent;
    }
    return intent;
  }

  var promptState = { dialog: null, lastFocus: null };

  function closeAuthPrompt() {
    if (!promptState.dialog) return;
    var doc = global.document || document;
    var node = promptState.dialog;
    promptState.dialog = null;
    if (node.parentNode) node.parentNode.removeChild(node);
    doc.removeEventListener('keydown', promptKeydown, true);
    doc.body.style.overflow = promptState.previousOverflow || '';
    promptState.previousOverflow = null;
    if (promptState.lastFocus && typeof promptState.lastFocus.focus === 'function') promptState.lastFocus.focus();
  }

  function promptKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAuthPrompt();
      return;
    }
    if (event.key !== 'Tab' || !promptState.dialog) return;
    var focusable = promptState.dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && (global.document || document).activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (global.document || document).activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openAuthPrompt(intent, triggerNode) {
    var doc = global.document || document;
    closeAuthPrompt();
    promptState.lastFocus = triggerNode || doc.activeElement;
    var dialog = el('div', { class: 'modal', attrs: { role: 'presentation' } }, [
      el('div', { class: 'modal__backdrop', dataset: { promptClose: 'true' } }),
      el('div', {
        class: 'modal__panel modal--sm',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shop-prompt-title' },
      }, [
        el('div', { class: 'modal__head' }, [
          el('h2', { class: 'modal__title', id: 'shop-prompt-title', text: intent.title }),
          el('button', { class: 'modal__close', type: 'button', text: '✕', attrs: { 'aria-label': 'إغلاق', dataset: { promptClose: 'true' } } }),
        ]),
        el('div', { class: 'modal__body' }, [
          el('p', { class: 'shop-note', text: intent.message }),
        ]),
        el('div', { class: 'modal__foot' }, [
          el('a', { class: 'btn btn--primary', href: buildHash({ path: '/login', query: { next: currentReturnPath() } }), text: 'تسجيل الدخول' }),
          el('a', { class: 'btn btn--secondary', href: buildHash({ path: '/register', query: { next: currentReturnPath() } }), text: 'إنشاء حساب' }),
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'متابعة التصفح', dataset: { promptClose: 'true' } }),
        ]),
      ]),
    ]);
    dialog.addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.dataset && target.dataset.promptClose) closeAuthPrompt();
    });
    doc.body.appendChild(dialog);
    doc.addEventListener('keydown', promptKeydown, true);
    promptState.previousOverflow = doc.body.style.overflow || '';
    doc.body.style.overflow = 'hidden';
    promptState.dialog = dialog;
    var firstAction = dialog.querySelector('.modal__foot .btn');
    if (firstAction) firstAction.focus();
  }

  function currentReturnPath() {
    if (!global.location) return '/';
    return String(global.location.hash || '').replace(/^#/, '') || '/';
  }

  /** يحوّل مسارًا داخليًا (قد يحتوي استعلامًا) إلى hash سليم — يستخدمه الانتقال بعد المصادقة. */
  function hashFor(target) {
    var raw = String(target || '/');
    if (raw.charAt(0) !== '/') raw = '/' + raw;
    var parts = raw.split('?');
    var query = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      if (kv[0]) query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    return buildHash({ path: parts[0] || '/', query: query });
  }

  /* ------------------------------------------------------------------ visitor state */
  function visitorState() {
    if (!ALW.session) return 'visitor';
    return ALW.session.isActive() ? 'authenticated' : 'visitor';
  }

  var shop = {
    el: el,
    clear: clear,
    parseHash: parseHash,
    buildHash: buildHash,
    buildProductQuery: buildProductQuery,
    pickQuery: pickQuery,
    productCardModel: productCardModel,
    addToCartIntent: addToCartIntent,
    money: money,
    api: api,
    toast: toast,
    stateBlock: stateBlock,
    loadingBlock: loadingBlock,
    productCard: productCard,
    imageNode: imageNode,
    badge: badge,
    stockBadge: stockBadge,
    handleAddToCart: handleAddToCart,
    openAuthPrompt: openAuthPrompt,
    closeAuthPrompt: closeAuthPrompt,
    visitorState: visitorState,
    currentReturnPath: currentReturnPath,
    ALLOWED_PRODUCT_PARAMS: ALLOWED_PRODUCT_PARAMS,
    MAX_LINE_QUANTITY: MAX_LINE_QUANTITY,
    cartModel: cartModel,
    lineLimits: lineLimits,
    cartErrorInfo: cartErrorInfo,
    routeGuard: routeGuard,
    hashFor: hashFor,
    setPendingAdd: setPendingAdd,
    takePendingAdd: takePendingAdd,
  };

  ALW.shop = shop;
  if (typeof module !== 'undefined' && module.exports) module.exports = shop;
})(typeof window !== 'undefined' ? window : globalThis);
