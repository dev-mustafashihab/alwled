/**
 * alwled — لوحة التحكم (Dashboard): مؤشرات حقيقية من /admin/dashboard/* و/admin/analytics/timeseries.
 * لا أرقام وهمية: كل رقم يأتي من الـAPI، وأي فشل يظهر كحالة خطأ مع إعادة محاولة.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  function rangeDays() {
    return 30;
  }

  function rangeQuery(days) {
    var to = new Date();
    var from = new Date(to.getTime() - (days || rangeDays()) * 86400000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function kpiSkeletons() {
    return global.ALW.feedback.skeletonCards(4);
  }

  function overviewCards(data) {
    var grid = document.createElement('div');
    grid.className = 'kpi-grid';
    var users = data.users || {};
    var products = data.products || {};
    var inventory = data.inventory || {};
    var orders = data.orders || {};
    var payments = data.payments || {};

    grid.appendChild(ui.kpi({
      label: 'الطلبات الكلية', value: F.number(orders.total), icon: 'cart', tone: 'info',
      hint: 'قيد الانتظار: ' + F.number(orders.pending) + ' · مؤكَّد: ' + F.number(orders.confirmed) + ' · ملغى: ' + F.number(orders.cancelled),
      onClick: function () { global.ALW.router && global.ALW.nav && global.ALW.nav.go('/orders'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'الدفعات', value: F.number(payments.total), icon: 'credit-card', tone: 'brand',
      hint: 'ناجحة: ' + F.number(payments.succeeded) + ' · فاشلة: ' + F.number(payments.failed) + ' · بانتظار المراجعة: ' + F.number(payments.pendingReview),
      onClick: function () { global.ALW.nav && global.ALW.nav.go('/payments'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'تحصيل ناجح', value: F.money(payments.succeededAmount, 'USD'), icon: 'dollar', tone: 'success',
      hint: 'قيد التحصيل: ' + F.money(payments.pendingAmount, 'USD'),
    }));
    grid.appendChild(ui.kpi({
      label: 'المخزون المتاح', value: F.number(inventory.available), icon: 'boxes',
      tone: inventory.outOfStock ? 'danger' : inventory.lowStock ? 'warning' : 'success',
      hint: 'منخفض: ' + F.number(inventory.lowStock) + ' · نفد: ' + F.number(inventory.outOfStock) + ' · منتجات متتبَّعة: ' + F.number(inventory.trackedProducts),
      onClick: function () { global.ALW.nav && global.ALW.nav.go('/inventory'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'المستخدمون', value: F.number(users.total), icon: 'users',
      hint: 'عملاء: ' + F.number(users.customers) + ' · فريق: ' + F.number(users.staff) + ' · موقوف: ' + F.number(users.suspended),
      onClick: function () { global.ALW.nav && global.ALW.nav.go('/customers'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'المنتجات', value: F.number(products.total), icon: 'package',
      hint: 'نشط: ' + F.number(products.active) + ' · معطَّل: ' + F.number(products.inactive) + ' · بلا صورة رئيسية: ' + F.number(products.withoutPrimaryImage),
      onClick: function () { global.ALW.nav && global.ALW.nav.go('/products'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'طلبات التحقق', value: F.number((data.verifications || {}).total), icon: 'shield',
      tone: (data.verifications || {}).inReview ? 'warning' : 'info',
      hint: 'قيد المراجعة: ' + F.number((data.verifications || {}).inReview) + ' · موثَّق: ' + F.number((data.verifications || {}).verified),
      onClick: function () { global.ALW.nav && global.ALW.nav.go('/verification'); },
    }));
    grid.appendChild(ui.kpi({
      label: 'آخر تحديث', value: '', icon: 'clock',
      hint: F.dateTime(data.generatedAt) + ' · المنطقة الزمنية: ' + (data.timezone || 'UTC'),
    }));
    return grid;
  }

  function render(container) {
    dom.mount(container, []);

    var header = ui.pageHeader({
      title: 'لوحة التحكم',
      icon: 'dashboard',
      description: 'نظرة شاملة على المتجر — كل الأرقام مباشرة من قاعدة البيانات.',
      actions: [
        ui.button({
          label: 'تحديث',
          icon: 'refresh',
          onClick: function () {
            render(container);
          },
        }),
        global.ALW.can.can('analytics.read')
          ? ui.button({ label: 'التحليلات', icon: 'chart', variant: 'btn--primary', onClick: function () { global.ALW.nav.go('/analytics'); } })
          : null,
      ].filter(Boolean),
    });
    container.appendChild(header);

    var overviewWrap = document.createElement('div');
    overviewWrap.className = 'stack';
    overviewWrap.appendChild(kpiSkeletons());
    container.appendChild(overviewWrap);

    var split = document.createElement('div');
    split.className = 'split mt-5';
    var left = document.createElement('div');
    left.className = 'stack';
    var right = document.createElement('div');
    right.className = 'stack';
    split.appendChild(left);
    split.appendChild(right);
    container.appendChild(split);

    var timeseriesCard = ui.card({
      title: 'الطلبات والتحصيل (30 يومًا)',
      icon: 'trending-up',
      subtitle: 'المصدر: /admin/analytics/timeseries',
      body: global.ALW.feedback.skeletonRows(6, '26px'),
    });
    left.appendChild(timeseriesCard);

    var recentOrdersCard = ui.card({
      title: 'آخر الطلبات',
      icon: 'cart',
      actions: [ui.button({ label: 'عرض الكل', size: 'sm', onClick: function () { global.ALW.nav.go('/orders'); } })],
      body: global.ALW.feedback.skeletonRows(5, '40px'),
    });
    left.appendChild(recentOrdersCard);

    var reviewCard = ui.card({
      title: 'طابور مراجعة الدفعات',
      icon: 'alert-circle',
      subtitle: 'دفعات بانتظار قرار موظف',
      actions: [ui.button({ label: 'فتح الطابور', size: 'sm', onClick: function () { global.ALW.nav.go('/payments/review'); } })],
      body: global.ALW.feedback.skeletonRows(4, '40px'),
    });
    right.appendChild(reviewCard);

    var inventoryCard = ui.card({
      title: 'مؤشرات المخزون',
      icon: 'boxes',
      body: global.ALW.feedback.skeletonRows(4, '26px'),
    });
    right.appendChild(inventoryCard);

    var paymentsCard = ui.card({
      title: 'الدفعات حسب الحالة',
      icon: 'credit-card',
      body: global.ALW.feedback.skeletonRows(4, '26px'),
    });
    right.appendChild(paymentsCard);

    var recentPaymentsCard = ui.card({
      title: 'آخر الدفعات',
      icon: 'wallet',
      body: global.ALW.feedback.skeletonRows(5, '40px'),
    });
    left.appendChild(recentPaymentsCard);

    /* ------------------------------- data loads ------------------------------ */
    global.ALW.api
      .get('/admin/dashboard/overview')
      .then(function (data) {
        dom.mount(overviewWrap, [overviewCards(data)]);
        var inventory = data.inventory || {};
        var definitions = inventory.definitions || {};
        var inventoryBody = document.createElement('div');
        inventoryBody.appendChild(ui.statRow('منتجات متتبَّعة', F.number(inventory.trackedProducts), { icon: 'package' }));
        inventoryBody.appendChild(ui.statRow('الكمية الكلية', F.number(inventory.totalQuantity), { icon: 'boxes' }));
        inventoryBody.appendChild(ui.statRow('المحجوز', F.number(inventory.totalReserved), { icon: 'clock' }));
        inventoryBody.appendChild(ui.statRow('المتاح', F.number(inventory.available), { icon: 'check-circle' }));
        inventoryBody.appendChild(ui.statRow('مخزون منخفض', F.number(inventory.lowStock), { icon: 'trending-down' }));
        inventoryBody.appendChild(ui.statRow('نفد المخزون', F.number(inventory.outOfStock), { icon: 'package-x' }));
        if (definitions.available) {
          inventoryBody.appendChild(ui.alertBox('تعريف المتاح: ' + definitions.available + ' — ' + (definitions.lowStock || ''), 'info'));
        }
        var lowStockList = inventory.lowStockProducts || [];
        if (lowStockList.length) {
          inventoryBody.appendChild(ui.statRow('أمثلة منخفضة', lowStockList.slice(0, 3).map(function (item) {
            return (item.name || item.productName || '') + ' (' + F.number(item.availableQuantity) + ')';
          }).join(' · ')));
        }
        dom.mount(inventoryCard.querySelector('.card__body'), [inventoryBody]);

        var payments = data.payments || {};
        var paymentBars = [
          { label: 'بانتظار الدفع', value: payments.pending, tone: 'warning' },
          { label: 'بانتظار المراجعة', value: payments.pendingReview },
          { label: 'قيد المعالجة', value: payments.processing },
          { label: 'ناجحة', value: payments.succeeded, tone: 'success' },
          { label: 'فاشلة', value: payments.failed, tone: 'danger' },
          { label: 'ملغاة', value: payments.cancelled },
        ];
        dom.mount(paymentsCard.querySelector('.card__body'), [ui.barList(paymentBars, { emptyText: 'لا دفعات بعد.' })]);
      })
      .catch(function (error) {
        dom.mount(overviewWrap, [global.ALW.feedback.errorState(error, function () { render(container); })]);
      });

    global.ALW.api
      .get('/admin/analytics/timeseries', { query: Object.assign({ granularity: 'day' }, rangeQuery(rangeDays())) })
      .then(function (data) {
        var series = (data && data.series) || [];
        var points = series.map(function (bucket) {
          return {
            label: bucket.date.slice(5),
            value: bucket.orders,
            secondary: bucket.succeededPayments,
            displayValue: F.number(bucket.orders) + ' طلب',
            secondaryDisplay: F.number(bucket.succeededPayments) + ' دفعة (' + F.money(bucket.succeededPaymentAmount, 'USD') + ')',
          };
        });
        var body = document.createElement('div');
        body.appendChild(
          global.ALW.chart.line({
            points: points,
            valueLabel: 'الطلبات',
            secondaryLabel: 'دفعات ناجحة',
            ariaLabel: 'الطلبات والدفعات الناجحة خلال 30 يومًا',
            legend: [
              { label: 'الطلبات', color: 'var(--brand-500)' },
              { label: 'دفعات ناجحة', color: 'var(--accent-500)' },
            ],
            emptyText: 'لا بيانات في هذه الفترة.',
          }),
        );
        var totals = (data && data.totals) || {};
        var summary = document.createElement('div');
        summary.className = 'row row--between mt-3';
        var totalOrders = document.createElement('span');
        totalOrders.className = 'text-sm muted';
        totalOrders.textContent = 'إجمالي الطلبات: ' + F.number(totals.orders) + ' — قيمتها ' + F.money(totals.orderValue, 'USD');
        summary.appendChild(totalOrders);
        var totalPayments = document.createElement('span');
        totalPayments.className = 'text-sm muted';
        totalPayments.textContent = 'تحصيل ناجح: ' + F.number(totals.succeededPayments) + ' — ' + F.money(totals.succeededPaymentAmount, 'USD');
        summary.appendChild(totalPayments);
        body.appendChild(summary);
        dom.mount(timeseriesCard.querySelector('.card__body'), [body]);
      })
      .catch(function (error) {
        dom.mount(timeseriesCard.querySelector('.card__body'), [global.ALW.feedback.errorState(error)]);
      });

    global.ALW.api
      .get('/admin/dashboard/recent-orders', { query: { limit: 6 } })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          dom.mount(recentOrdersCard.querySelector('.card__body'), [global.ALW.feedback.empty('لا طلبات بعد.')]);
          return;
        }
        var table = document.createElement('div');
        table.className = 'table-wrap';
        var node = document.createElement('table');
        node.className = 'table table--compact';
        node.innerHTML = '<thead><tr><th>رقم الطلب</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead>';
        var tbody = document.createElement('tbody');
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          tr.classList.add('table__row--clickable');
          tr.addEventListener('click', function () { global.ALW.nav.go('/orders'); });
          var numberTd = document.createElement('td');
          var number = document.createElement('span');
          number.className = 'mono table__primary';
          number.textContent = item.orderNumber;
          numberTd.appendChild(number);
          tr.appendChild(numberTd);
          var statusTd = document.createElement('td');
          statusTd.appendChild(ui.enumBadge(F.ORDER_STATUS, item.status));
          tr.appendChild(statusTd);
          var totalTd = document.createElement('td');
          totalTd.className = 'tnum';
          totalTd.textContent = F.money(item.total, item.currency);
          tr.appendChild(totalTd);
          var dateTd = document.createElement('td');
          dateTd.className = 'text-xs muted';
          dateTd.textContent = F.relative(item.createdAt);
          tr.appendChild(dateTd);
          tbody.appendChild(tr);
        });
        node.appendChild(tbody);
        table.appendChild(node);
        dom.mount(recentOrdersCard.querySelector('.card__body'), [table]);
      })
      .catch(function (error) {
        dom.mount(recentOrdersCard.querySelector('.card__body'), [global.ALW.feedback.errorState(error)]);
      });

    global.ALW.api
      .get('/admin/dashboard/payment-review', { query: { limit: 5 } })
      .then(function (data) {
        var items = (data && data.items) || [];
        var head = document.createElement('div');
        head.className = 'row row--between mb-4';
        var count = document.createElement('span');
        count.className = 'badge badge--warning';
        count.textContent = 'بانتظار المراجعة: ' + F.number((data && data.awaitingReviewTotal) || 0);
        head.appendChild(count);
        var amount = document.createElement('span');
        amount.className = 'text-sm muted';
        amount.textContent = 'بقيمة ' + F.money((data && data.awaitingReviewAmount) || '0.00', 'USD');
        head.appendChild(amount);
        var body = document.createElement('div');
        body.appendChild(head);
        if (!items.length) {
          body.appendChild(global.ALW.feedback.empty('لا دفعات بانتظار المراجعة.'));
        } else {
          items.forEach(function (payment) {
            var row = document.createElement('div');
            row.className = 'stat-row';
            row.style.cursor = 'pointer';
            row.addEventListener('click', function () { global.ALW.nav.go('/payments/review'); });
            var label = document.createElement('span');
            label.className = 'stat-row__label';
            label.appendChild(dom.icon('wallet', 'icon icon--sm'));
            var text = document.createElement('span');
            text.className = 'mono';
            text.textContent = F.shortId(payment.id, 12) + ' · ' + (payment.transactionReference || 'بلا مرجع');
            label.appendChild(text);
            row.appendChild(label);
            var value = document.createElement('span');
            value.className = 'stat-row__value';
            value.textContent = F.money(payment.amount, payment.currency);
            row.appendChild(value);
            body.appendChild(row);
          });
        }
        dom.mount(reviewCard.querySelector('.card__body'), [body]);
      })
      .catch(function (error) {
        dom.mount(reviewCard.querySelector('.card__body'), [global.ALW.feedback.errorState(error)]);
      });

    global.ALW.api
      .get('/admin/dashboard/recent-payments', { query: { limit: 6 } })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          dom.mount(recentPaymentsCard.querySelector('.card__body'), [global.ALW.feedback.empty('لا دفعات بعد.')]);
          return;
        }
        var table = document.createElement('div');
        table.className = 'table-wrap';
        var node = document.createElement('table');
        node.className = 'table table--compact';
        node.innerHTML = '<thead><tr><th>الدفعة</th><th>الحالة</th><th>المبلغ</th><th>التاريخ</th></tr></thead>';
        var tbody = document.createElement('tbody');
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          var idTd = document.createElement('td');
          idTd.className = 'mono';
          idTd.textContent = F.shortId(item.id, 12);
          tr.appendChild(idTd);
          var statusTd = document.createElement('td');
          statusTd.appendChild(ui.enumBadge(F.PAYMENT_STATUS, item.status));
          tr.appendChild(statusTd);
          var amountTd = document.createElement('td');
          amountTd.className = 'tnum';
          amountTd.textContent = F.money(item.amount, item.currency);
          tr.appendChild(amountTd);
          var dateTd = document.createElement('td');
          dateTd.className = 'text-xs muted';
          dateTd.textContent = F.relative(item.createdAt);
          tr.appendChild(dateTd);
          tbody.appendChild(tr);
        });
        node.appendChild(tbody);
        table.appendChild(node);
        dom.mount(recentPaymentsCard.querySelector('.card__body'), [table]);
      })
      .catch(function (error) {
        dom.mount(recentPaymentsCard.querySelector('.card__body'), [global.ALW.feedback.errorState(error)]);
      });

    return container;
  }

  global.ALW = global.ALW || {};
  global.ALW.pages = global.ALW.pages || {};
  global.ALW.pages.dashboard = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
