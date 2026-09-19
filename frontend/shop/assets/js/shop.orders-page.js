/**
 * alwled shop — طلباتي `#/orders` (Stage 14.3). GET /orders + GET /payments (حالة الدفع تُدمج من الـBackend).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var helpers = ALW.shopPageHelpers;
  var ui = ALW.shopCartUI;
  var flow = ALW.shopOrderFlow;
  var el = helpers.el;

  function ordersPage(view, ctx) {
    shop.clear(view);
    var crumbList = [{ label: 'الرئيسية', href: '#/' }, { label: 'طلباتي' }];
    view.appendChild(helpers.crumbs(crumbList));

    if (shop.visitorState() !== 'authenticated') {
      ui.authRequiredBlock(view, {
        title: 'تسجيل الدخول مطلوب',
        text: 'سجّل دخولك لعرض طلباتك ومتابعتها.',
        next: '/orders',
      });
      return Promise.resolve(false);
    }

    view.appendChild(shop.loadingBlock('جارٍ تحميل طلباتك…'));

    return Promise.all([
      shop.api.orders({ page: 1, limit: 20 }),
      // null = فشل قراءة الدفعات (لا نُظهر «بلا دفع» خطأً)
      shop.api.payments({ page: 1, limit: 50 }).catch(function () { return null; }),
    ]).then(function (results) {
      var payload = results[0] || {};
      var items = payload.items || [];
      var meta = payload.meta || {};
      var paymentsReadFailed = results[1] === null;
      var payments = (results[1] && results[1].items) || [];
      var paymentByOrder = {};
      payments.forEach(function (payment) { paymentByOrder[String(payment.orderId)] = payment; });

      var filterNumber = (ctx && ctx.query && ctx.query.orderNumber) || null;
      var visible = filterNumber ? items.filter(function (order) { return String(order.orderNumber) === String(filterNumber); }) : items;

      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      if (paymentsReadFailed) {
        view.appendChild(el('p', { class: 'shop-note', attrs: { id: 'shop-orders-payments-note' },
          text: 'تعذّر تحميل حالة الدفع الآن — الطلبات معروضة، ويمكنك تحديث الصفحة لاحقًا.' }));
      }
      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: 'طلباتي' }),
          el('p', { class: 'shop-section__sub', text: meta.total ? meta.total + ' طلب' : 'لا توجد طلبات بعد' }),
        ]),
        filterNumber
          ? el('a', { class: 'btn btn--ghost btn--sm', href: '#/orders', text: 'عرض كل الطلبات' })
          : null,
      ]));

      if (!items.length) {
        view.appendChild(shop.stateBlock('empty', 'لا توجد طلبات بعد', 'عند إتمام طلبك سيظهر هنا مع حالته وحالة دفعه.', [
          el('a', { class: 'btn btn--primary', href: '#/products', text: 'تصفّح المنتجات' }),
        ]));
        return false;
      }

      if (!visible.length) {
        view.appendChild(shop.stateBlock('empty', 'لا يوجد طلب بهذا الرقم', 'قد يكون الرقم قديمًا أو لا يخصّ حسابك.', [
          el('a', { class: 'btn btn--primary', href: '#/orders', text: 'عرض كل الطلبات' }),
        ]));
        return false;
      }

      view.appendChild(el('div', { class: 'shop-orders' }, visible.map(function (order) {
        return orderRow(order, paymentByOrder[String(order.id)]);
      })));
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(helpers.crumbs(crumbList));
      var info = shop.cartErrorInfo(error);
      if (info.kind === 'auth') {
        ui.authRequiredBlock(view, { next: '/orders' });
        return false;
      }
      view.appendChild(shop.stateBlock('error', 'تعذّر تحميل الطلبات', info.message, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: function () { ordersPage(view, ctx); } }),
      ]));
      return false;
    });
  }

  function orderRow(order, payment) {
    var status = flow.orderStatusMeta(order.status);
    var payMeta = payment ? flow.paymentStatusMeta(payment.status) : null;
    return el('article', { class: 'shop-order-row', dataset: { orderId: String(order.id) } }, [
      el('div', { class: 'shop-order-row__main' }, [
        el('div', { class: 'shop-order-row__head' }, [
          el('strong', { class: 'shop-order-row__number', text: order.orderNumber || ('#' + order.id) }),
          shop.badge(status.label, status.tone),
          payMeta ? shop.badge('الدفع: ' + payMeta.label, payMeta.tone) : null,
        ]),
        el('div', { class: 'shop-order-row__meta' }, [
          el('span', { text: 'التاريخ: ' + ALW.format.dateTime(order.createdAt) }),
          el('span', { text: 'عدد الأصناف: ' + (order.itemCount || 0) }),
        ]),
      ]),
      el('div', { class: 'shop-order-row__side' }, [
        el('span', { class: 'shop-price__now', text: shop.money(order.total) }),
        el('a', {
          class: 'btn btn--secondary btn--sm', href: shop.buildHash({ path: '/orders/' + order.id }),
          text: 'عرض التفاصيل',
        }),
      ]),
    ]);
  }

  ALW.shopPages = ALW.shopPages || {};
  ALW.shopPages.orders = ordersPage;
  ALW.shopOrdersPage = ordersPage;
})(typeof window !== 'undefined' ? window : globalThis);
