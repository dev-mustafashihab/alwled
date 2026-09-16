/**
 * alwled — التحليلات: سلاسل زمنية + توزيعات الطلبات/الدفعات/المخزون/التحقق.
 * كل الأرقام من /admin/dashboard/* و/admin/analytics/* فقط.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  function rangeQuery(days) {
    var to = new Date();
    var from = new Date(to.getTime() - days * 86400000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function render(container) {
    dom.mount(container, []);
    var state = { days: 30, granularity: 'day' };

    var controls = document.createElement('div');
    controls.className = 'row';
    var daysSelect = document.createElement('select');
    daysSelect.className = 'select';
    daysSelect.style.width = 'auto';
    daysSelect.setAttribute('aria-label', 'الفترة');
    [7, 30, 90].forEach(function (days) {
      var option = document.createElement('option');
      option.value = days;
      option.textContent = 'آخر ' + days + ' يومًا';
      if (days === state.days) option.selected = true;
      daysSelect.appendChild(option);
    });
    controls.appendChild(daysSelect);

    var granularitySelect = document.createElement('select');
    granularitySelect.className = 'select';
    granularitySelect.style.width = 'auto';
    granularitySelect.setAttribute('aria-label', 'التجميع');
    [['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']].forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0];
      option.textContent = entry[1];
      granularitySelect.appendChild(option);
    });
    controls.appendChild(granularitySelect);

    container.appendChild(
      ui.pageHeader({
        title: 'التحليلات',
        icon: 'chart',
        description: 'اتجاهات الطلبات والتحصيل والمخزون (قراءة فقط).',
        actions: [controls],
      }),
    );

    var seriesCard = ui.card({
      title: 'السلاسل الزمنية',
      icon: 'trending-up',
      body: global.ALW.feedback.skeletonRows(8, '24px'),
    });
    container.appendChild(seriesCard);

    var grid = document.createElement('div');
    grid.className = 'grid-2 mt-5';

    var ordersCard = ui.card({ title: 'الطلبات', icon: 'cart', body: global.ALW.feedback.skeletonRows(4, '24px') });
    var paymentsCard = ui.card({ title: 'الدفعات', icon: 'credit-card', body: global.ALW.feedback.skeletonRows(4, '24px') });
    var inventoryCard = ui.card({ title: 'المخزون', icon: 'boxes', body: global.ALW.feedback.skeletonRows(4, '24px') });
    var verificationsCard = ui.card({ title: 'التحقق', icon: 'shield', body: global.ALW.feedback.skeletonRows(4, '24px') });
    [ordersCard, paymentsCard, inventoryCard, verificationsCard].forEach(function (card) {
      grid.appendChild(card);
    });
    container.appendChild(grid);

    function bodyOf(card) {
      return card.querySelector('.card__body');
    }

    function loadSeries() {
      dom.mount(bodyOf(seriesCard), [global.ALW.feedback.skeletonRows(8, '24px')]);
      return global.ALW.api
        .get('/admin/analytics/timeseries', {
          query: Object.assign({ granularity: state.granularity }, rangeQuery(state.days)),
        })
        .then(function (data) {
          var series = (data && data.series) || [];
          var points = series.map(function (bucket) {
            return {
              label: bucket.date.slice(5),
              value: bucket.orders,
              secondary: bucket.succeededPayments,
              displayValue: F.number(bucket.orders) + ' طلب',
              secondaryDisplay: F.money(bucket.succeededPaymentAmount, 'USD'),
            };
          });
          dom.mount(bodyOf(seriesCard), [
            global.ALW.chart.line({
              points: points,
              height: 300,
              valueLabel: 'الطلبات',
              secondaryLabel: 'تحصيل',
              legend: [
                { label: 'الطلبات', color: 'var(--brand-500)' },
                { label: 'الدفعات الناجحة', color: 'var(--accent-500)' },
              ],
              emptyText: 'لا بيانات في هذه الفترة.',
            }),
          ]);
        })
        .catch(function (error) {
          dom.mount(bodyOf(seriesCard), [global.ALW.feedback.errorState(error, loadSeries)]);
        });
    }

    function loadOrders() {
      return global.ALW.api
        .get('/admin/dashboard/orders', { query: rangeQuery(state.days) })
        .then(function (data) {
          var node = document.createElement('div');
          node.appendChild(ui.detailGrid([
            ['إجمالي الطلبات', F.number(data.total)],
            ['قيمة الطلبات', F.money(data.totalValue, 'USD')],
            ['متوسط الطلب', F.money(data.averageOrderValue, 'USD')],
            ['أصغر طلب', F.money(data.minOrderValue, 'USD')],
            ['أكبر طلب', F.money(data.maxOrderValue, 'USD')],
            ['الفترة', F.dateOnly(data.range && data.range.from) + ' → ' + F.dateOnly(data.range && data.range.to)],
          ]));
          node.appendChild(ui.barList(
            (data.byStatus || []).map(function (entry) {
              var meta = F.ORDER_STATUS[entry.status] || { label: entry.status };
              return { label: meta.label, value: entry.count, tone: F.enumTone(F.ORDER_STATUS, entry.status) };
            }),
            { emptyText: 'لا طلبات في الفترة.' },
          ));
          dom.mount(bodyOf(ordersCard), [node]);
        })
        .catch(function (error) {
          dom.mount(bodyOf(ordersCard), [global.ALW.feedback.errorState(error, loadOrders)]);
        });
    }

    function loadPayments() {
      return global.ALW.api
        .get('/admin/dashboard/payments', { query: rangeQuery(state.days) })
        .then(function (data) {
          var node = document.createElement('div');
          node.appendChild(ui.detailGrid([
            ['إجمالي الدفعات', F.number(data.total)],
            ['تحصيل ناجح', F.money(data.succeededAmount, 'USD') + ' (' + F.number(data.succeededCount) + ')'],
            ['قيد التحصيل', F.money(data.pendingAmount, 'USD') + ' (' + F.number(data.pendingCount) + ')'],
            ['بانتظار المراجعة', F.money(data.pendingReviewAmount, 'USD') + ' (' + F.number(data.pendingReviewCount) + ')'],
            ['فاشلة', F.number(data.failedCount)],
            ['ملغاة', F.number(data.cancelledCount)],
          ]));
          node.appendChild(ui.alertBox((data.shamCash && data.shamCash.note) || '', 'info', {
            hint: 'يدوي مؤكَّد: ' + F.number(data.shamCash && data.shamCash.manuallyConfirmedCount) + ' · يدوي مرفوض: ' + F.number(data.shamCash && data.shamCash.manuallyRejectedCount),
          }));
          node.appendChild(ui.barList(
            (data.byStatus || []).map(function (entry) {
              return { label: F.enumLabel(F.PAYMENT_STATUS, entry.status), value: entry.count, tone: F.enumTone(F.PAYMENT_STATUS, entry.status) };
            }),
            { emptyText: 'لا دفعات في الفترة.' },
          ));
          dom.mount(bodyOf(paymentsCard), [node]);
        })
        .catch(function (error) {
          dom.mount(bodyOf(paymentsCard), [global.ALW.feedback.errorState(error, loadPayments)]);
        });
    }

    function loadInventory() {
      return global.ALW.api
        .get('/admin/dashboard/inventory')
        .then(function (data) {
          var node = document.createElement('div');
          node.appendChild(ui.detailGrid([
            ['منتجات متتبَّعة', F.number(data.trackedProducts)],
            ['الكمية الكلية', F.number(data.totalQuantity)],
            ['المحجوز', F.number(data.totalReserved)],
            ['المتاح', F.number(data.available)],
            ['المتوسط', F.number(data.averageQuantity)],
            ['منخفض / نفد', F.number(data.lowStock) + ' / ' + F.number(data.outOfStock)],
          ]));
          var low = data.lowStockProducts || [];
          if (low.length) {
            node.appendChild(ui.barList(low.slice(0, 8).map(function (item) {
              return { label: item.name || item.productName || String(item.productId), value: item.availableQuantity, tone: item.availableQuantity <= 0 ? 'danger' : 'warning' };
            })));
          } else {
            node.appendChild(ui.alertBox('لا منتجات منخفضة المخزون حاليًا.', 'success'));
          }
          dom.mount(bodyOf(inventoryCard), [node]);
        })
        .catch(function (error) {
          dom.mount(bodyOf(inventoryCard), [global.ALW.feedback.errorState(error, loadInventory)]);
        });
    }

    function loadVerifications() {
      return global.ALW.api
        .get('/admin/dashboard/verifications', { query: rangeQuery(state.days) })
        .then(function (data) {
          var node = document.createElement('div');
          node.appendChild(ui.detailGrid([
            ['إجمالي الطلبات', F.number(data.total)],
            ['قيد المراجعة', F.number(data.inReview)],
            ['موثَّق', F.number(data.verified)],
            ['مرفوض', F.number(data.rejected)],
            ['متأخر عن المهلة', F.number(data.activePastDeadline)],
          ]));
          node.appendChild(ui.alertBox(data.note || '', 'info'));
          node.appendChild(ui.barList(
            (data.byStatus || []).map(function (entry) {
              return { label: F.enumLabel(F.VERIFICATION_STATUS, entry.status), value: entry.count, tone: F.enumTone(F.VERIFICATION_STATUS, entry.status) };
            }),
            { emptyText: 'لا طلبات تحقق في الفترة.' },
          ));
          dom.mount(bodyOf(verificationsCard), [node]);
        })
        .catch(function (error) {
          dom.mount(bodyOf(verificationsCard), [global.ALW.feedback.errorState(error, loadVerifications)]);
        });
    }

    function loadAll() {
      loadSeries();
      loadOrders();
      loadPayments();
      loadInventory();
      loadVerifications();
    }

    daysSelect.addEventListener('change', function () {
      state.days = Number(daysSelect.value);
      loadAll();
    });
    granularitySelect.addEventListener('change', function () {
      state.granularity = granularitySelect.value;
      loadSeries();
    });

    loadAll();
    return container;
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.analytics = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
