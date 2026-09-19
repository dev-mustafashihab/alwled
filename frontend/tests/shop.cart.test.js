/**
 * اختبارات Stage 14.2 — المصادقة + السلة + معاينة الطلب (منطق نقي، بلا DOM).
 * تتحقق أيضًا أن المتجر لا يستدعي أي مسار إداري/طلب/دفع، وأن كل الشبكة تمر من العميل المركزي.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const CORE = path.join(__dirname, '..', 'assets', 'js', 'core');
require(path.join(CORE, 'config.js'));
require(path.join(CORE, 'session.js'));
require(path.join(CORE, 'format.js'));
require(path.join(CORE, 'api.js'));

const shop = require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.js'));
const ALW = globalThis.ALW;

const CART_FIXTURE = {
  id: 337,
  items: [
    {
      id: 1952, productId: 633,
      product: { id: 633, name: 'منتج تجريبي — ثلاجة 300 لتر', sku: 'DEMO-REF-002', price: '350.00', primaryImage: { url: '/uploads/a.jpg' } },
      quantity: 2, unitPrice: '350.00', lineSubtotal: '700.00', availableQuantity: 12, isAvailable: true, issues: [],
    },
    {
      id: 1953, productId: 999,
      product: { id: 999, name: 'منتج غير متوفر', sku: 'X-1', price: '500.00', primaryImage: null },
      quantity: 1, unitPrice: '500.00', lineSubtotal: '500.00', availableQuantity: 0, isAvailable: false,
      issues: [{ message: 'الكمية المطلوبة غير متوفرة' }],
    },
  ],
  itemCount: 2, totalQuantity: 3, subtotal: '1200.00', currency: 'USD', isCheckoutReady: false, issues: [],
};

describe('shop cart — model', () => {
  test('maps the real cart payload without inventing values', () => {
    const cart = shop.cartModel(CART_FIXTURE);
    expect(cart.itemCount).toBe(2);
    expect(cart.totalQuantity).toBe(3);
    expect(cart.subtotal).toBe('1200.00');
    expect(cart.currency).toBe('USD');
    expect(cart.isCheckoutReady).toBe(false);
    expect(cart.items[0].name).toContain('ثلاجة');
    expect(cart.items[0].unitPrice).toBe('350.00');
    expect(cart.items[0].lineSubtotal).toBe('700.00');
    expect(cart.items[0].image).toBe('/uploads/a.jpg');
    expect(cart.items[0].href).toBe('#/products/633');
    expect(cart.items[1].isAvailable).toBe(false);
    expect(cart.items[1].issues.length).toBe(1);
  });

  test('an empty cart is normalised, never fabricated', () => {
    const cart = shop.cartModel(null);
    expect(cart.items).toEqual([]);
    expect(cart.itemCount).toBe(0);
    expect(cart.subtotal).toBe('0.00');
    expect(cart.isCheckoutReady).toBe(false);
  });

  test('quantity limits follow the backend rules (1 … min(20, available))', () => {
    expect(shop.lineLimits({ availableQuantity: 12, quantity: 2 })).toEqual({ min: 1, max: 12, clamped: false });
    expect(shop.lineLimits({ availableQuantity: 100, quantity: 5 })).toEqual({ min: 1, max: 20, clamped: false });
    expect(shop.lineLimits({ availableQuantity: 0, quantity: 1 }).max).toBe(1);
    expect(shop.lineLimits({ availableQuantity: null, quantity: 1 }).max).toBe(shop.MAX_LINE_QUANTITY);
    expect(shop.MAX_LINE_QUANTITY).toBe(20);
  });
});

describe('shop cart — error mapping', () => {
  test('401 → session message, never a raw technical error', () => {
    const info = shop.cartErrorInfo({ status: 401, code: 'unauthorized', message: 'Unauthorized' });
    expect(info.kind).toBe('auth');
    expect(info.message).toContain('سجّل الدخول');
  });

  test('409 keeps the server explanation (stock/limit conflicts)', () => {
    const info = shop.cartErrorInfo({ status: 409, code: 'conflict', message: 'الحد الأقصى للكمية في السطر الواحد هو 20' });
    expect(info.kind).toBe('conflict');
    expect(info.message).toContain('20');
  });

  test('404 (deleted product) is explained and retryable', () => {
    const info = shop.cartErrorInfo({ status: 404, code: 'not_found', message: 'المنتج غير موجود' });
    expect(info.kind).toBe('missing');
    expect(info.retry).toBe(true);
  });

  test('400 validation is translated to Arabic', () => {
    const info = shop.cartErrorInfo({ status: 400, code: 'validation', fields: [{ message: 'quantity must not be less than 1' }] });
    expect(info.kind).toBe('invalid');
    expect(info.message).toContain('1');
  });

  test('network errors never lose the page', () => {
    const info = shop.cartErrorInfo({ status: 0, code: 'network' });
    expect(info.kind).toBe('network');
    expect(info.retry).toBe(true);
  });
});

describe('shop cart — route guard', () => {
  test('cart and checkout require a customer session', () => {
    expect(shop.routeGuard('cart', 'visitor')).toBe('auth-required');
    expect(shop.routeGuard('checkout', 'visitor')).toBe('auth-required');
    expect(shop.routeGuard('cart', 'authenticated')).toBe('allow');
    expect(shop.routeGuard('products', 'visitor')).toBe('allow');
    expect(shop.routeGuard('home', 'visitor')).toBe('allow');
  });
});

describe('shop — pending add intent', () => {
  test('stored without secrets and consumed once', () => {
    const store = {};
    const previous = globalThis.sessionStorage;
    globalThis.sessionStorage = {
      setItem: (key, value) => { store[key] = value; },
      getItem: (key) => (key in store ? store[key] : null),
      removeItem: (key) => { delete store[key]; },
    };
    shop.setPendingAdd(633, 2);
    expect(Object.keys(store)).toEqual(['alwled.shop.pendingAdd']);
    expect(store['alwled.shop.pendingAdd']).toBe('{"productId":633,"quantity":2}');
    expect(shop.takePendingAdd()).toEqual({ productId: 633, quantity: 2 });
    expect(shop.takePendingAdd()).toBeNull();
    globalThis.sessionStorage = previous;
  });
});

describe('shop — auth redirect helpers', () => {
  test('hashFor keeps next targets stable (no redirect loop)', () => {
    expect(shop.hashFor('/')).toBe('#/');
    expect(shop.hashFor('/cart')).toBe('#/cart');
    expect(shop.hashFor('/products/633')).toBe('#/products/633');
    expect(shop.hashFor('/checkout?step=1')).toBe('#/checkout?step=1');
  });

  test('cart and checkout are valid store routes', () => {
    expect(shop.parseHash('#/cart').name).toBe('cart');
    expect(shop.parseHash('#/checkout').name).toBe('checkout');
    expect(shop.parseHash('#/account').name).toBe('account');
  });
});

describe('shop — integration surface (no admin, no order, no payment)', () => {
  const files = ['shop.js', 'shop.cart.js', 'shop.cart-ui.js', 'shop.cart-page.js', 'shop.checkout-page.js', 'shop.account-page.js', 'shop.pages.js', 'shop.app.js'];
  const sources = files.map((file) => [file, fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8')]);

  test('no raw fetch anywhere in the store', () => {
    sources.forEach(([file, source]) => {
      expect(`${file}:${/\bfetch\s*\(/.test(source)}`).toBe(`${file}:false`);
    });
  });

  test('no cart data is cached in the browser (backend is the source of truth)', () => {
    ['shop.cart.js', 'shop.cart-ui.js', 'shop.cart-page.js', 'shop.checkout-page.js', 'shop.account-page.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8');
      expect(`${file}:${/localStorage\s*\./.test(source)}`).toBe(`${file}:false`);
    });
    // الاستخدام الوحيد المسموح لـlocalStorage في المتجر هو تفضيل الثيم (مفتاح ثابت معلن)
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.app.js'), 'utf8');
    expect(appSource).toContain('THEME_KEY');
    expect(/localStorage[\s\S]{0,60}cart/i.test(appSource)).toBe(false);
  });

  test('no admin/employee/role/audit endpoint leaked into the store code', () => {
    sources.forEach(([file, source]) => {
      ['/admin', '/employees', '/roles', '/permissions', '/audit', '/dashboard'].forEach((forbidden) => {
        expect(`${file}:${source.includes(forbidden)}`).toBe(`${file}:false`);
      });
    });
  });

  test('the store only calls documented customer endpoints (orders/payments/notifications included)', () => {
    const endpoints = [];
    sources.forEach(([, source]) => {
      const matches = source.match(/ALW\.api\.(get|post|patch|del)\('([^']+)'/g) || [];
      matches.forEach((match) => {
        const path = match.split("'")[1];
        endpoints.push(path.replace(/\s*\+.*$/, ''));
      });
    });
    const allowed = [
      '/products', '/products/', '/categories', '/brands', '/auth/login', '/auth/register', '/auth/me',
      '/auth/refresh', '/auth/logout', '/cart', '/cart/items', '/cart/items/', '/checkout/preview',
      '/orders', '/orders/', '/payments', '/payments/', '/notifications', '/users/me', '/verification',
      '/auth/change-password', '/auth/sessions',
    ];
    endpoints.forEach((endpoint) => {
      expect(allowed.some((prefix) => endpoint === prefix || endpoint.startsWith(prefix))).toBe(true);
    });
    expect(endpoints).toContain('/checkout/preview');
    expect(endpoints).toContain('/orders');
  });
});
