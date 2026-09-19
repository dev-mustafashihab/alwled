/**
 * اختبارات واجهة المتجر العام (Stage 14.1).
 * تغطّي المنطق النقي: الموجّه، بناء معاملات API المدعومة فقط، نماذج المنتجات،
 * حالة الزائر، وقرار «أضف إلى السلة» (الزائر لا يُرسل أي طلب سلة).
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
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.cart.js'));
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.pages.js'));
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.cart-ui.js'));
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.cart-page.js'));
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.checkout-page.js'));
require(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.account-page.js'));

const ALW = globalThis.ALW;

function withSession(stub) {
  const previous = ALW.session;
  ALW.session = stub;
  return () => {
    ALW.session = previous;
  };
}

describe('shop — routing', () => {
  test('empty hash resolves to home', () => {
    expect(shop.parseHash('').name).toBe('home');
    expect(shop.parseHash('#/').name).toBe('home');
  });

  test('product routes parse the id and the query string', () => {
    const state = shop.parseHash('#/products/633?ref=home');
    expect(state.name).toBe('product');
    expect(state.params[0]).toBe('633');
    expect(state.query.ref).toBe('home');
  });

  test('products route keeps decoded filters', () => {
    const state = shop.parseHash('#/products?search=' + encodeURIComponent('ثلاجة') + '&categoryId=293&page=2');
    expect(state.name).toBe('products');
    expect(state.query.search).toBe('ثلاجة');
    expect(state.query.categoryId).toBe('293');
    expect(state.query.page).toBe('2');
  });

  test('auth routes and unknown routes', () => {
    expect(shop.parseHash('#/login').name).toBe('login');
    expect(shop.parseHash('#/register').name).toBe('register');
    expect(shop.parseHash('#/definitely-unknown').name).toBe('notfound');
  });

  test('buildHash round-trips through parseHash', () => {
    const hash = shop.buildHash({ path: '/products', query: { search: 'ثلاجة', page: 2 } });
    const state = shop.parseHash(hash);
    expect(state.name).toBe('products');
    expect(state.query.search).toBe('ثلاجة');
    expect(state.query.page).toBe('2');
  });
});

describe('shop — product query contract', () => {
  test('only documented params reach the backend', () => {
    const query = shop.buildProductQuery({
      page: 3, limit: 12, search: '  ثلاجة  ', categoryId: 293, brandId: 254,
      sortBy: 'price', sortOrder: 'asc', view: 'brands', foo: 'bar', evil: 1,
    });
    expect(Object.keys(query).sort()).toEqual(['brandId', 'categoryId', 'limit', 'page', 'search', 'sortBy', 'sortOrder']);
    expect(query.view).toBeUndefined();
    expect(query.foo).toBeUndefined();
    expect(query.search).toBe('ثلاجة');
    expect(query.sortBy).toBe('price');
    expect(query.sortOrder).toBe('asc');
  });

  test('invalid sort and paging fall back to safe defaults', () => {
    const query = shop.buildProductQuery({ page: -5, limit: 999, sortBy: 'DROP TABLE', sortOrder: 'sideways' });
    expect(query.page).toBe(1);
    expect(query.limit).toBe(12);
    expect(query.sortBy).toBeUndefined();
    expect(query.sortOrder).toBeUndefined();
  });

  test('empty optional filters are dropped', () => {
    const query = shop.buildProductQuery({ search: '', categoryId: '', brandId: null });
    expect(query).toEqual({ page: 1, limit: 12 });
  });
});

describe('shop — product model', () => {
  const apiProduct = {
    id: 633, name: 'منتج تجريبي — ثلاجة 300 لتر', sku: 'DEMO-REF-002',
    shortDescription: 'وصف قصير', price: '350.00', compareAtPrice: null,
    brand: { id: 254, name: 'علامة تجريبية ب' }, category: { id: 293, name: 'تصنيف تجريبي — ثلاجات' },
    images: [], primaryImage: null, hasDiscount: false, discountPercentage: 0,
  };

  test('maps the real API fields without inventing any', () => {
    const model = shop.productCardModel(apiProduct);
    expect(model.id).toBe(633);
    expect(model.name).toBe('منتج تجريبي — ثلاجة 300 لتر');
    expect(model.price).toBe('350.00');
    expect(model.brand).toBe('علامة تجريبية ب');
    expect(model.category).toBe('تصنيف تجريبي — ثلاجات');
    expect(model.image).toBeNull();
    // لا يُعيد الـAPI حالة مخزون منطقية لهذا المنتج ⇒ null (بلا تخمين من الواجهة)
    expect(model.inStock).toBeNull();
    expect(model.href).toBe('#/products/633');
  });

  test('uses primaryImage or the first gallery image when present', () => {
    expect(shop.productCardModel(Object.assign({}, apiProduct, { primaryImage: { url: '/u/a.jpg' } })).image).toBe('/u/a.jpg');
    expect(shop.productCardModel(Object.assign({}, apiProduct, { images: [{ url: '/u/b.jpg' }] })).image).toBe('/u/b.jpg');
    expect(shop.productCardModel(Object.assign({}, apiProduct, { images: ['/u/c.jpg'] })).image).toBe('/u/c.jpg');
  });

  test('backend money strings are formatted, never recomputed', () => {
    // القيمة تُعرض كما وردت من الـBackend (Decimal بنصّ) + العملة — بلا أي حساب float
    expect(shop.money('350.00')).toBe('350.00 $');
    expect(shop.money('0.10')).toBe('0.10 $');
    expect(shop.money('1234567.89')).toBe('1234567.89 $');
  });

  test('missing images keep a placeholder (no external stock images)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.js'), 'utf8');
    expect(source).toContain('shop-card__placeholder');
    expect(source).toContain('loading: lazy');
    // لا روابط صور خارجية داخل كود المتجر (لا stock images)
    expect(/https?:\/\//.test(source)).toBe(false);
    expect(shop.productCardModel(apiProduct).image).toBeNull();
  });
});

describe('shop — visitor state and add-to-cart', () => {
  test('visitor is prompted to authenticate, and no cart call is made', () => {
    const restore = withSession({ isActive: () => false });
    expect(shop.visitorState()).toBe('visitor');
    const intent = shop.addToCartIntent(shop.visitorState());
    expect(intent.action).toBe('auth-required');
    expect(intent.message).toContain('سجّل الدخول');
    restore();
  });

  test('authenticated customer gets an honest pending-cart message (no fake success)', () => {
    const restore = withSession({ isActive: () => true });
    expect(shop.visitorState()).toBe('authenticated');
    const intent = shop.addToCartIntent(shop.visitorState());
    // السلة والدفع منفّذان فعلياً (Stages 14.2+) ⇒ نيّة إضافة حقيقية
    expect(intent.action).toBe('cart-add');
    expect(intent.message).toContain('سلتك');
    restore();
  });

  test('the shop API surface is customer-only and complete for stage 14.3', () => {
    const keys = Object.keys(shop.api).sort();
    // Stage 14.3: المتجر تطبيق عميل — كتالوج وسلة ومصادقة + طلبات/دفع/إشعارات/توثيق للعميل الحالي
    ['orders', 'createOrder', 'order', 'orderCancel', 'payments', 'paymentCreate', 'paymentSubmit',
      'shamCashAccount', 'notifications', 'unreadCount', 'notificationRead', 'notificationsReadAll',
      'notificationPreferences', 'notificationPreferenceUpdate', 'verification', 'verificationStart',
      'verificationCancel', 'sessions', 'changePassword', 'profileUpdate'].forEach((key) => {
      expect(keys).toContain(key);
    });
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('employees');
  });

  test('no admin/employee/roles/audit/dashboard endpoint is reachable from the store', () => {
    const files = ['shop.js', 'shop.pages.js', 'shop.cart.js', 'shop.cart-page.js', 'shop.checkout-page.js',
      'shop.orders-page.js', 'shop.order-page.js', 'shop.payment-page.js', 'shop.notifications-page.js',
      'shop.account-page.js', 'shop.verification-page.js', 'shop.app.js'];
    const source = files.map((file) => fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8')).join('\n');
    ['/admin', '/employees', '/roles', '/permissions', '/audit', '/dashboard', '/analytics', '/inventory']
      .forEach((forbidden) => {
        expect(`store:${source.includes(forbidden)}`).toBe('store:false');
      });
  });

  test('no page file performs a raw fetch (all traffic goes through the central client)', () => {
    ['shop.js', 'shop.pages.js', 'shop.app.js', 'shop.cart.js', 'shop.cart-ui.js', 'shop.cart-page.js', 'shop.checkout-page.js', 'shop.account-page.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8');
      expect(/\bfetch\s*\(/.test(source)).toBe(false);
    });
  });

  test('the store routes are registered', () => {
    expect(Object.keys(ALW.shopPages).sort()).toEqual(['account', 'cart', 'checkout', 'home', 'login', 'notfound', 'product', 'products', 'register']);
  });
});
