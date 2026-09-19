/**
 * اختبارات منطق رحلة العميل (Stage 14.3): مفاتيح idempotency الثابتة، خرائط الحالات،
 * قرارات حالة الآلة (إلغاء الطلب/التوثيق)، الخط الزمني الحقيقي، وتوجيه الإشعارات الآمن.
 */
'use strict';

const path = require('path');

const CORE = path.join(__dirname, '..', 'assets', 'js', 'core');
require(path.join(CORE, 'config.js'));
require(path.join(CORE, 'session.js'));
require(path.join(CORE, 'format.js'));
require(path.join(CORE, 'api.js'));

const SHOP = path.join(__dirname, '..', 'shop', 'assets', 'js');
const shop = require(path.join(SHOP, 'shop.js'));
require(path.join(SHOP, 'shop.pages.js'));          // ALW.shopPageHelpers (el/fact/crumbs)
require(path.join(SHOP, 'shop.order-flow.js'));     // ALW.shopOrderFlow (pure flow logic)
require(path.join(SHOP, 'shop.cart.js'));
require(path.join(SHOP, 'shop.cart-ui.js'));
require(path.join(SHOP, 'shop.cart-page.js'));
require(path.join(SHOP, 'shop.checkout-page.js'));
require(path.join(SHOP, 'shop.orders-page.js'));
require(path.join(SHOP, 'shop.order-page.js'));
require(path.join(SHOP, 'shop.payment-page.js'));
require(path.join(SHOP, 'shop.notifications-page.js'));
require(path.join(SHOP, 'shop.account-page.js'));
require(path.join(SHOP, 'shop.verification-page.js'));

const flow = globalThis.ALW.shopOrderFlow;

describe('stages 14.3 — routing additions', () => {
  test.each([
    ['#/orders', 'orders', []],
    ['#/orders/42', 'order', ['42']],
    ['#/orders/42/payment', 'payment', ['42']],
    ['#/notifications', 'notifications', []],
    ['#/verification', 'verification', []],
  ])('%s resolves to %s', (hash, name, params) => {
    const state = shop.parseHash(hash);
    expect(state.name).toBe(name);
    expect(state.params).toEqual(params);
  });

  test('the payment route wins over the order route for the same id', () => {
    expect(shop.parseHash('#/orders/7/payment').name).toBe('payment');
    expect(shop.parseHash('#/orders/7').name).toBe('order');
  });

  test('unknown routes still fall through to notfound', () => {
    expect(shop.parseHash('#/orders/7/whatever').name).toBe('notfound');
  });
});

describe('stages 14.3 — status labels', () => {
  test('order status labels are Arabic and never leak enum names', () => {
    expect(flow.orderStatusMeta('PENDING').label).toBe('قيد الانتظار');
    expect(flow.orderStatusMeta('CONFIRMED').label).toBe('مؤكد');
    expect(flow.orderStatusMeta('CANCELLED').label).toBe('ملغى');
    expect(flow.orderStatusMeta('WEIRD').label).toBe('غير معروف');
  });

  test('every payment status in the backend state machine has a label', () => {
    ['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].forEach((status) => {
      const meta = flow.paymentStatusMeta(status);
      expect(meta.label).toBeTruthy();
      expect(meta.tone).toBeTruthy();
    });
  });

  test('every verification status from stage 9 has a label', () => {
    ['NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'CANCELLED'].forEach((status) => {
      expect(flow.verificationStatusMeta(status).label).toBeTruthy();
    });
  });
});

describe('stages 14.3 — cancellation follows the backend state machine', () => {
  test('only a pending, non-cancelled order offers the cancel CTA', () => {
    expect(flow.canCancelOrder({ status: 'PENDING' })).toBe(true);
    expect(flow.canCancelOrder({ status: 'CONFIRMED' })).toBe(false);
    expect(flow.canCancelOrder({ status: 'CANCELLED' })).toBe(false);
    expect(flow.canCancelOrder({ status: 'PENDING', cancelledAt: '2026-09-16T00:00:00.000Z' })).toBe(false);
    expect(flow.canCancelOrder(null)).toBe(false);
  });

  test('verification actions come from the server flags only', () => {
    expect(flow.verificationAction({ status: 'NOT_STARTED', canStart: true, canCancel: false })).toBe('start');
    expect(flow.verificationAction({ status: 'PENDING', canStart: false, canCancel: true })).toBe('cancel');
    expect(flow.verificationAction({ status: 'IN_REVIEW', canStart: false, canCancel: false })).toBe('none');
    expect(flow.verificationAction({ status: 'VERIFIED', canStart: false, canCancel: false })).toBe('none');
    expect(flow.verificationAction({ status: 'REJECTED', canStart: true, canCancel: false })).toBe('start');
    expect(flow.verificationAction({})).toBe('none');
  });
});

describe('stages 14.3 — idempotency keys stay stable per logical attempt', () => {
  test('the same fingerprint reuses the same key (double click / retry safe)', () => {
    flow.clearIdempotencyKey('t-stable');
    const first = flow.idempotencyKey('t-stable', 'cart:1x2');
    const second = flow.idempotencyKey('t-stable', 'cart:1x2');
    expect(second).toBe(first);
  });

  test('a changed cart fingerprint produces a new key', () => {
    flow.clearIdempotencyKey('t-change');
    const first = flow.idempotencyKey('t-change', 'cart:1x2');
    const second = flow.idempotencyKey('t-change', 'cart:1x3');
    expect(second).not.toBe(first);
  });

  test('clearing after success yields a fresh key', () => {
    flow.clearIdempotencyKey('t-clear');
    const first = flow.idempotencyKey('t-clear', 'cart:1x2');
    flow.clearIdempotencyKey('t-clear');
    const second = flow.idempotencyKey('t-clear', 'cart:1x2');
    expect(second).not.toBe(first);
  });

  test('a key is a compact, header-safe token', () => {
    flow.clearIdempotencyKey('payment-12');
    const key = flow.idempotencyKey('payment-12', 'order:12:shamcash');
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(key.length).toBeGreaterThan(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

describe('stages 14.3 — cart fingerprint', () => {
  test('is stable for the same cart and changes with quantities', () => {
    const a = flow.cartFingerprint({ items: [{ productId: 1, quantity: 2 }, { productId: 5, quantity: 1 }] });
    const b = flow.cartFingerprint({ items: [{ productId: 1, quantity: 2 }, { productId: 5, quantity: 1 }] });
    const c = flow.cartFingerprint({ items: [{ productId: 1, quantity: 3 }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('handles an empty or malformed cart without throwing', () => {
    expect(flow.cartFingerprint(null)).toBeTruthy();
    expect(flow.cartFingerprint({})).toBeTruthy();
  });
});

describe('stages 14.3 — order timeline uses real events only', () => {
  test('no timestamps are invented when the backend returns none', () => {
    const steps = flow.orderTimeline({ status: 'PENDING', createdAt: null }, null);
    expect(steps.length).toBeGreaterThan(0);
    steps.forEach((step) => expect(step.at).toBeFalsy());
  });

  test('payment submission and review only appear when the fields exist', () => {
    const withoutReview = flow.orderTimeline(
      { status: 'PENDING', createdAt: '2026-09-16T10:00:00.000Z' },
      { status: 'PENDING_REVIEW', submittedAt: '2026-09-16T11:00:00.000Z' }
    );
    expect(withoutReview.some((step) => step.label.includes('مراجعة'))).toBe(true);
    expect(withoutReview.every((step) => step.at !== '2026-09-16T12:00:00.000Z')).toBe(true);

    const reviewed = flow.orderTimeline(
      { status: 'CONFIRMED', createdAt: '2026-09-16T10:00:00.000Z' },
      { status: 'SUCCEEDED', submittedAt: '2026-09-16T11:00:00.000Z', reviewedAt: '2026-09-16T12:00:00.000Z' }
    );
    const labels = reviewed.map((step) => step.label).join(' | ');
    expect(labels).toContain('تأكيد الدفع');
  });

  test('a cancelled order surfaces the cancellation event', () => {
    const steps = flow.orderTimeline({ status: 'CANCELLED', createdAt: '2026-09-16T10:00:00.000Z', cancelledAt: '2026-09-16T13:00:00.000Z' }, null);
    expect(steps.some((step) => step.label.includes('إلغاء'))).toBe(true);
  });
});

describe('stages 14.3 — notification routing is safe', () => {
  test('order notifications link to the order list with a validated order number', () => {
    const target = flow.notificationTarget({ type: 'ORDER_CREATED', data: { orderNumber: 'ORD-2026-0001' } });
    expect(target.hash).toBe('#/orders?orderNumber=ORD-2026-0001');
  });

  test('a malicious orderNumber cannot escape the hash or inject markup', () => {
    const target = flow.notificationTarget({ type: 'ORDER_CREATED', data: { orderNumber: '"><img src=x onerror=alert(1)>' } });
    expect(target.hash).not.toContain('<');
    expect(target.hash.startsWith('#/orders')).toBe(true);
  });

  test('payment notifications route to the order payments and verification to its page', () => {
    expect(flow.notificationTarget({ type: 'PAYMENT_CONFIRMED', data: { orderNumber: 'ORD-1' } }).hash.startsWith('#/orders')).toBe(true);
    expect(flow.notificationTarget({ type: 'VERIFICATION_VERIFIED', data: {} }).hash).toBe('#/verification');
    expect(flow.notificationTarget({ type: 'SOMETHING_ELSE', data: {} })).toBeNull();
  });

  test('categories map to the four store areas', () => {
    expect(flow.notificationCategory('PAYMENT_SUBMITTED_FOR_REVIEW')).toBe('payment');
    expect(flow.notificationCategory('ORDER_CREATED')).toBe('order');
    expect(flow.notificationCategory('VERIFICATION_STARTED')).toBe('verification');
    expect(flow.notificationCategory('LOW_STOCK')).toBe('other');
  });
});

describe('stages 14.3 — store never calls admin APIs', () => {
  const files = [
    'shop.order-flow.js', 'shop.orders-page.js', 'shop.order-page.js', 'shop.payment-page.js',
    'shop.notifications-page.js', 'shop.account-page.js', 'shop.verification-page.js',
    'shop.checkout-page.js', 'shop.app.js', 'shop.js', 'shop.cart.js', 'shop.pages.js',
  ];

  test.each(files)('%s has no /admin, no raw fetch and no hardcoded secrets', (file) => {
    const fs = require('fs');
    const source = fs.readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(withoutComments).not.toMatch(/['"`]\/admin/);
    expect(withoutComments).not.toMatch(/\bfetch\s*\(/);
    expect(withoutComments).not.toMatch(/localStorage\.setItem\(\s*['"][^'"]*(token|password|secret)/i);
  });
});

describe('stage 14.4 — a failed payments read must never look like "no payment yet"', () => {
  const read = (file) => require('fs').readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', file), 'utf8');

  test('the payment page retries once and then surfaces an error instead of an empty state', () => {
    const source = read('shop.payment-page.js');
    expect(source).toMatch(/loadPayments\(attempt\)/);
    expect(source).toMatch(/return loadPayments\(attempt \+ 1\)/);
    expect(source).toMatch(/throw error;/);
  });

  test('the order page distinguishes a failed read from a missing payment', () => {
    const source = read('shop.order-page.js');
    expect(source).toContain('paymentsFailed');
    expect(source).toMatch(/تعذّر تحميل حالة الدفع/);
  });

  test('no store module silently swallows the payments list failure into an empty list', () => {
    ['shop.payment-page.js', 'shop.order-page.js', 'shop.orders-page.js'].forEach((file) => {
      const source = read(file).replace(/\s+/g, ' ');
      const swallow = /payments\([^)]*\)\.catch\(function \(\) \{ return \{ items: \[\] \}; \}\)/.test(source);
      expect(`${file}:${swallow}`).toBe(`${file}:false`);
    });
  });
});

describe('stage 14.4 — cold load of a private route must not keep a false login guard', () => {
  test('the app re-renders the route once the async session restore succeeds', () => {
    const source = require('fs').readFileSync(path.join(__dirname, '..', 'shop', 'assets', 'js', 'shop.app.js'), 'utf8');
    expect(source).toContain('renderedAsVisitor');
    expect(source).toMatch(/if \(authenticated && shellNodes\.renderedAsVisitor\)\s*\{[\s\S]{0,80}renderRoute\(\);/);
  });
});
