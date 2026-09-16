/**
 * alwled — صفحات العمليات: الطلبات · الدفعات (وشام كاش) · العملاء · الموظفون ·
 * التحقق · سجل التدقيق · الإشعارات.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  function loadRoles() {
    return global.ALW.api.get('/roles', { query: { limit: 100 } }).then(function (data) {
      return (data && data.items) || [];
    });
  }

  function deferred(loader, factory) {
    var container = document.createElement('div');
    dom.mount(container, [global.ALW.feedback.skeletonTable(8)]);
    function build() {
      dom.mount(container, [global.ALW.feedback.skeletonTable(8)]);
      return Promise.resolve(loader())
        .then(function (options) {
          var page = factory(options);
          dom.mount(container, []);
          container.appendChild(page.render ? page.render() : page.node);
          container.__page = page;
        })
        .catch(function (error) {
          dom.mount(container, [global.ALW.feedback.errorState(error, build)]);
        });
    }
    build();
    return {
      container: container,
      refresh: function () {
        return container.__page && container.__page.refresh ? container.__page.refresh() : build();
      },
    };
  }

  function statusTone(map, key) {
    return F.enumTone(map, key);
  }

  /* ---------------------------------- orders -------------------------------- */
  function ordersPage(options) {
    var opts = options || {};
    return global.ALW.resourcePage.create({
      title: opts.title || 'الطلبات',
      icon: 'cart',
      description: opts.description || 'طلبات العملاء مع الحجز على المخزون وتغيير الحالة.',
      endpoint: '/admin/orders',
      initialFilters: opts.initialFilters || {},
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: 'لا توجد طلبات مطابقة.',
      filters: [
        {
          key: 'status', label: 'الحالة',
          options: [
            { value: 'PENDING', label: 'قيد الانتظار' },
            { value: 'CONFIRMED', label: 'مؤكَّد' },
            { value: 'CANCELLED', label: 'ملغى' },
          ],
        },
      ],
      columns: [
        {
          key: 'orderNumber', label: 'رقم الطلب',
          render: function (row) {
            var wrap = document.createElement('div');
            var number = document.createElement('div');
            number.className = 'table__primary mono';
            number.textContent = row.orderNumber;
            wrap.appendChild(number);
            var sub = document.createElement('div');
            sub.className = 'table__sub';
            sub.textContent = F.relative(row.createdAt);
            wrap.appendChild(sub);
            return wrap;
          },
        },
        { key: 'status', label: 'الحالة', render: function (row) { return ui.enumBadge(F.ORDER_STATUS, row.status); } },
        { key: 'itemCount', label: 'العناصر', render: function (row) { return F.number(row.itemCount); } },
        { key: 'total', label: 'الإجمالي', render: function (row) { return ui.moneyCell(row.total, row.currency); } },
        { key: 'shippingAmount', label: 'التوصيل', render: function (row) { return ui.moneyCell(row.shippingAmount, row.currency); } },
        { key: 'discountAmount', label: 'الخصم', render: function (row) { return ui.moneyCell(row.discountAmount, row.currency); } },
        { key: 'userId', label: 'العميل', render: function (row) { return ui.copyable(F.shortId(row.userId, 12)); } },
        { key: 'createdAt', label: 'التاريخ', render: function (row) { return F.dateTime(row.createdAt); } },
      ],
      rowActions: [
        {
          label: 'تأكيد الطلب',
          icon: 'check-circle',
          permission: 'orders.update',
          visible: function (row) { return row.status === 'PENDING'; },
          confirm: {
            title: 'تأكيد الطلب',
            message: 'سيصبح الطلب مؤكَّدًا. الحجز على المخزون يبقى كما هو (لا بيع فعلي في هذه المرحلة).',
            tone: 'warning',
            confirmLabel: 'تأكيد الطلب',
          },
          run: function (row) { return global.ALW.api.patch('/admin/orders/' + row.id + '/status', { status: 'CONFIRMED' }); },
          successMessage: 'تم تأكيد الطلب',
        },
        {
          label: 'إلغاء الطلب',
          icon: 'x-circle',
          permission: 'orders.update',
          visible: function (row) { return row.status !== 'CANCELLED'; },
          form: {
            title: 'إلغاء الطلب',
            icon: 'x-circle',
            message: 'إلغاء الطلب يحرّر الكمية المحجوزة ويعيدها للمخزون المتاح.',
            tone: 'danger',
            submitLabel: 'إلغاء الطلب',
            submitClass: 'btn--danger',
            endpoint: function (row) { return '/admin/orders/' + row.id + '/status'; },
            method: 'patch',
            fields: [{ name: 'reason', label: 'سبب الإلغاء (إلزامي)', required: true, maxLength: 300, full: true }],
            toBody: function (values) { return { status: 'CANCELLED', reason: values.reason }; },
            successMessage: 'تم إلغاء الطلب',
          },
        },
      ],
      detail: {
        title: function (row) { return 'الطلب ' + row.orderNumber; },
        size: 'lg',
        endpoint: function (row) { return '/admin/orders/' + row.id; },
        render: function (order) {
          var nodes = [];
          nodes.push(ui.detailGrid([
            ['رقم الطلب', order.orderNumber],
            ['الحالة', ui.enumBadge(F.ORDER_STATUS, order.status)],
            ['العميل', ui.copyable(order.userId, { mono: true })],
            ['العملة', order.currency],
            ['أُنشئ', F.dateTime(order.createdAt)],
            ['آخر تحديث', F.dateTime(order.updatedAt)],
            ['أُلغي', order.cancelledAt ? F.dateTime(order.cancelledAt) : '—'],
            ['سبب الإلغاء', order.cancellationReason || '—'],
          ]));

          var itemsTable = document.createElement('div');
          itemsTable.className = 'table-wrap';
          var table = document.createElement('table');
          table.className = 'table table--compact';
          table.innerHTML = '<thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>';
          var tbody = document.createElement('tbody');
          (order.items || []).forEach(function (item) {
            var tr = document.createElement('tr');
            var nameTd = document.createElement('td');
            nameTd.textContent = item.productName || '—';
            tr.appendChild(nameTd);
            [F.number(item.quantity), F.money(item.unitPrice, order.currency), F.money(item.lineSubtotal, order.currency)].forEach(function (value) {
              var td = document.createElement('td');
              td.className = 'tnum';
              td.textContent = value;
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          itemsTable.appendChild(table);
          nodes.push(ui.card({ title: 'عناصر الطلب', icon: 'package', body: itemsTable }));

          var totals = document.createElement('div');
          totals.appendChild(ui.statRow('المجموع الفرعي', F.money(order.subtotal, order.currency)));
          totals.appendChild(ui.statRow('التوصيل', F.money(order.shippingAmount, order.currency)));
          totals.appendChild(ui.statRow('الخصم', F.money(order.discountAmount, order.currency)));
          totals.appendChild(ui.statRow('الإجمالي', ui.moneyCell(order.total, order.currency)));
          nodes.push(ui.card({ title: 'المجاميع', icon: 'dollar', body: totals }));

          nodes.push(ui.timeline([
            { title: 'إنشاء الطلب', meta: F.dateTime(order.createdAt) },
            order.status === 'CONFIRMED' ? { title: 'تأكيد الطلب', meta: F.dateTime(order.updatedAt) } : null,
            order.cancelledAt ? { title: 'إلغاء الطلب', meta: F.dateTime(order.cancelledAt) + (order.cancellationReason ? ' — ' + order.cancellationReason : '') } : null,
          ].filter(Boolean)));
          return nodes;
        },
      },
    });
  }

  /* --------------------------------- payments ------------------------------- */
  function paymentsPage(options) {
    var opts = options || {};
    return global.ALW.resourcePage.create({
      title: opts.title || 'الدفعات',
      icon: 'credit-card',
      description: opts.description || 'دفعات الطلبات. الدفع عبر شام كاش يدوي: تأكيد/رفض بموجب مراجعة موظف موثّقة.',
      endpoint: '/admin/payments',
      initialFilters: opts.initialFilters || {},
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: opts.emptyText || 'لا توجد دفعات مطابقة.',
      notice: opts.notice,
      noticeTone: 'warning',
      filters: [
        {
          key: 'status', label: 'الحالة',
          options: [
            { value: 'PENDING', label: 'بانتظار الدفع' },
            { value: 'PENDING_REVIEW', label: 'بانتظار المراجعة' },
            { value: 'PROCESSING', label: 'قيد المعالجة' },
            { value: 'SUCCEEDED', label: 'ناجحة' },
            { value: 'FAILED', label: 'فاشلة' },
            { value: 'CANCELLED', label: 'ملغاة' },
          ],
        },
        { key: 'method', label: 'الطريقة', options: [{ value: 'SHAM_CASH', label: 'شام كاش (يدوي)' }] },
      ],
      columns: [
        {
          key: 'id', label: 'الدفعة',
          render: function (row) {
            var wrap = document.createElement('div');
            var id = document.createElement('div');
            id.className = 'table__primary mono';
            id.textContent = F.shortId(row.id, 12);
            wrap.appendChild(id);
            var sub = document.createElement('div');
            sub.className = 'table__sub';
            sub.textContent = 'طلب: ' + F.shortId(row.orderId, 10);
            wrap.appendChild(sub);
            return wrap;
          },
        },
        { key: 'status', label: 'الحالة', render: function (row) { return ui.enumBadge(F.PAYMENT_STATUS, row.status); } },
        { key: 'amount', label: 'المبلغ', render: function (row) { return ui.moneyCell(row.amount, row.currency); } },
        { key: 'method', label: 'الطريقة', render: function (row) { return ui.enumBadge(F.PAYMENT_METHOD, row.method); } },
        {
          key: 'transactionReference', label: 'مرجع التحويل',
          render: function (row) { return row.transactionReference ? ui.copyable(row.transactionReference) : '—'; },
        },
        {
          key: 'proofUrl', label: 'الإثبات', sortable: false,
          render: function (row) {
            if (!row.proofUrl) return ui.badge('لا يوجد', 'neutral');
            var url = dom.safeUrl(row.proofUrl);
            if (!url) return ui.badge('رابط غير صالح', 'warning');
            var link = document.createElement('a');
            link.className = 'btn btn--ghost btn--sm';
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.appendChild(dom.icon('external-link', 'icon icon--sm'));
            var span = document.createElement('span');
            span.textContent = 'عرض';
            link.appendChild(span);
            return link;
          },
        },
        { key: 'submittedAt', label: 'أُرسل', render: function (row) { return row.submittedAt ? F.relative(row.submittedAt) : '—'; } },
        { key: 'createdAt', label: 'أُنشئت', render: function (row) { return F.dateTime(row.createdAt); } },
      ],
      rowActions: [
        {
          label: 'تأكيد الدفعة',
          icon: 'check-circle',
          permission: 'payments.update',
          visible: function (row) { return row.status === 'PENDING_REVIEW'; },
          confirm: {
            title: 'تأكيد استلام الدفعة',
            message: 'أنت تؤكّد — بصفتك موظفًا — أن التحويل وصل لحساب المتجر. سيُسجَّل اسمك في سجل التدقيق، ولا يمكن التراجع عن القرار.',
            tone: 'warning',
            confirmLabel: 'تأكيد الدفعة',
          },
          run: function (row) { return global.ALW.api.post('/admin/payments/' + row.id + '/confirm', {}); },
          successMessage: 'تم تأكيد الدفعة',
        },
        {
          label: 'رفض الدفعة',
          icon: 'x-circle',
          permission: 'payments.update',
          visible: function (row) { return row.status === 'PENDING_REVIEW'; },
          form: {
            title: 'رفض الدفعة',
            icon: 'x-circle',
            message: 'الرفض يتطلب سببًا يظهر للعميل في الإشعار. راجع المرجع والإثبات قبل القرار.',
            tone: 'danger',
            submitLabel: 'رفض الدفعة',
            submitClass: 'btn--danger',
            endpoint: function (row) { return '/admin/payments/' + row.id + '/reject'; },
            fields: [{ name: 'reason', label: 'سبب الرفض (إلزامي)', required: true, maxLength: 300, full: true, placeholder: 'المرجع غير مطابق / لم يصل المبلغ' }],
            successMessage: 'تم رفض الدفعة',
          },
        },
        {
          label: 'إلغاء الدفعة',
          icon: 'circle-slash',
          permission: 'payments.update',
          visible: function (row) { return ['PENDING', 'PROCESSING', 'PENDING_REVIEW'].indexOf(row.status) !== -1; },
          confirm: {
            title: 'إلغاء الدفعة',
            message: 'ستُلغى الدفعة ولن تُقبل مراجعتها لاحقًا.',
            tone: 'danger',
            confirmLabel: 'إلغاء الدفعة',
          },
          run: function (row) { return global.ALW.api.post('/admin/payments/' + row.id + '/cancel', {}); },
          successMessage: 'تم إلغاء الدفعة',
        },
      ],
      detail: {
        title: function (row) { return 'الدفعة ' + F.shortId(row.id, 12); },
        size: 'lg',
        endpoint: function (row) { return '/admin/payments/' + row.id; },
        render: function (payment) {
          var nodes = [];
          nodes.push(ui.detailGrid([
            ['الحالة', ui.enumBadge(F.PAYMENT_STATUS, payment.status)],
            ['المبلغ', F.money(payment.amount, payment.currency)],
            ['العملة', payment.currency],
            ['الطريقة', ui.enumBadge(F.PAYMENT_METHOD, payment.method)],
            ['الطلب', ui.copyable(payment.orderId, { mono: true })],
            ['العميل', ui.copyable(payment.userId, { mono: true })],
            ['مرجع التحويل', payment.transactionReference || '—'],
            ['أُنشئت', F.dateTime(payment.createdAt)],
            ['أُرسل الإثبات', payment.submittedAt ? F.dateTime(payment.submittedAt) : '—'],
            ['راجعها', payment.reviewedAt ? F.dateTime(payment.reviewedAt) : '—'],
            ['سبب الرفض', payment.rejectionReason || '—'],
            [
              'المزوّد',
              payment.provider
                ? ui.badge(payment.provider, 'info')
                : ui.badge('لا مزوّد (تحويل يدوي)', 'neutral'),
            ],
            ['مرجع المزوّد', payment.providerPaymentId || '—'],
          ]));
          nodes.push(
            ui.alertBox(
              'التأكيد هنا قرار موظف يدوي موثّق، وليس تأكيدًا من مزوّد دفع إلكتروني. لا يوجد أي اتصال بمزوّد خارجي في هذه المرحلة.',
              'info',
            ),
          );
          if (payment.proofUrl) {
            var url = dom.safeUrl(payment.proofUrl);
            nodes.push(
              ui.card({
                title: 'إثبات التحويل',
                icon: 'file-check',
                body: url
                  ? dom.el('a', { class: 'btn btn--secondary', href: url, target: '_blank', rel: 'noopener noreferrer' }, [
                    dom.icon('external-link', 'icon'),
                    document.createTextNode(' فتح الإثبات في تبويب جديد'),
                  ])
                  : global.ALW.feedback.state({ compact: true, tone: 'error', icon: 'alert-triangle', title: 'رابط غير صالح', text: 'الرابط المُسجَّل لا يطابق سياسة الروابط المسموحة.' }),
              }),
            );
          }
          if (payment.proofNote) {
            nodes.push(ui.card({ title: 'ملاحظة الإثبات', body: payment.proofNote }));
          }
          return nodes;
        },
        footer: function (modal, row) {
          var buttons = [];
          if (global.ALW.can.can('payments.update') && row.status === 'PENDING_REVIEW') {
            buttons.push(ui.button({
              label: 'تأكيد',
              icon: 'check-circle',
              variant: 'btn--success',
              onClick: function () {
                global.ALW.modal
                  .confirm({
                    title: 'تأكيد استلام الدفعة',
                    message: 'سيُسجَّل قرارك باسمك في سجل التدقيق.',
                    tone: 'warning',
                    confirmLabel: 'تأكيد',
                    onConfirm: function () { return global.ALW.api.post('/admin/payments/' + row.id + '/confirm', {}); },
                  })
                  .then(function (confirmed) {
                    if (confirmed) {
                      global.ALW.toast.success('تم تأكيد الدفعة');
                      modal.close();
                    }
                  });
              },
            }));
          }
          return buttons;
        },
      },
    });
  }

  /* -------------------------------- customers ------------------------------- */
  function customersPage() {
    return global.ALW.resourcePage.create({
      title: 'العملاء',
      icon: 'users',
      description: 'حسابات المتجر: البحث، الحالة، التوثيق، وتعطيل الحساب عند الحاجة.',
      endpoint: '/users',
      search: 'search',
      searchPlaceholder: 'بحث بالاسم أو الهاتف أو البريد…',
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: 'لا يوجد عملاء مطابقون.',
      filters: [
        {
          key: 'status', label: 'الحالة',
          options: [
            { value: 'ACTIVE', label: 'نشط' },
            { value: 'SUSPENDED', label: 'موقوف' },
          ],
        },
        { key: 'isVerified', label: 'التوثيق', options: [{ value: 'true', label: 'موثَّق' }, { value: 'false', label: 'غير موثَّق' }] },
        { key: 'role', label: 'الدور', options: [{ value: 'CUSTOMER', label: 'عملاء فقط' }] },
      ],
      columns: [
        { key: 'name', label: 'العميل', render: function (row) { return ui.userCell(row); } },
        { key: 'phone', label: 'الهاتف', render: function (row) { return dom.el('span', { class: 'mono', text: row.phone || '—' }); } },
        { key: 'email', label: 'البريد', render: function (row) { return row.email || '—'; } },
        { key: 'roles', label: 'الأدوار', sortable: false, render: function (row) { return ui.badge((row.roles || []).join('، ') || '—', 'brand'); } },
        { key: 'status', label: 'الحالة', render: function (row) { return ui.enumBadge(F.USER_STATUS, row.status); } },
        { key: 'isVerified', label: 'التوثيق', render: function (row) { return row.isVerified ? ui.badge('موثَّق', 'success') : ui.badge('غير موثَّق', 'neutral'); } },
        { key: 'lastLoginAt', label: 'آخر دخول', render: function (row) { return row.lastLoginAt ? F.relative(row.lastLoginAt) : '—'; } },
        { key: 'createdAt', label: 'التسجيل', render: function (row) { return F.dateOnly(row.createdAt); } },
      ],
      form: {
        permission: ['users.update', 'employees.update'],
        createLabel: null,
        editable: function () { return false; },
        fields: [],
        endpoint: function (row) { return '/users/' + row.id; },
      },
      rowActions: [
        {
          label: 'تعطيل الحساب',
          icon: 'user-x',
          permission: ['users.update', 'employees.update'],
          visible: function (row) { return row.status === 'ACTIVE'; },
          confirm: {
            title: 'تعطيل حساب العميل',
            message: 'سيُمنع العميل من تسجيل الدخول فورًا وتُبطَل جلساته. لا تُحذف بياناته أو طلباته.',
            tone: 'danger',
            confirmLabel: 'تعطيل الحساب',
          },
          run: function (row) { return global.ALW.api.patch('/users/' + row.id + '/status', { isActive: false }); },
          successMessage: 'تم تعطيل الحساب',
        },
        {
          label: 'تفعيل الحساب',
          icon: 'user-check',
          permission: ['users.update', 'employees.update'],
          visible: function (row) { return row.status !== 'ACTIVE'; },
          run: function (row) { return global.ALW.api.patch('/users/' + row.id + '/status', { isActive: true }); },
          successMessage: 'تم تفعيل الحساب',
        },
      ],
      detail: {
        title: function (row) { return F.fullName(row); },
        endpoint: function (row) { return '/users/' + row.id; },
        render: function (user) {
          return [
            ui.detailGrid([
              ['المُعرِّف', ui.copyable(user.id, { mono: true })],
              ['الهاتف', user.phone || '—'],
              ['البريد', user.email || '—'],
              ['الحالة', ui.enumBadge(F.USER_STATUS, user.status)],
              ['التوثيق', user.isVerified ? ui.badge('موثَّق', 'success') : ui.badge('غير موثَّق', 'neutral')],
              ['الأدوار', (user.roles || []).join('، ') || '—'],
              ['آخر دخول', user.lastLoginAt ? F.dateTime(user.lastLoginAt) : '—'],
              ['تاريخ التسجيل', F.dateTime(user.createdAt)],
            ]),
            ui.alertBox('بيانات العرض محصورة بما يعيده الـAPI — لا تُعرض أي حقول حساسة (كلمة مرور/توكنات).', 'info'),
          ];
        },
      },
    });
  }

  /* -------------------------------- employees ------------------------------- */
  function employeesPage() {
    return deferred(loadRoles, function (roles) {
      var roleOptions = roles.map(function (role) { return { value: role.name, label: role.name + (role.isSystemRole ? ' (نظامي)' : '') }; });

      function assignRoleModal(employee) {
        var roleField = global.ALW.forms.form({
          fields: [{ name: 'roleName', label: 'الدور', type: 'select', required: true, options: roleOptions }],
        });
        var modal = global.ALW.modal.create({
          title: 'إسناد دور — ' + F.fullName(employee),
          icon: 'key',
          size: 'sm',
          content: roleField.node,
        });
        modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
        modal.addFooterButton({
          label: 'إسناد',
          className: 'btn--primary',
          loading: true,
          onClick: function () {
            var values = roleField.values();
            if (!values.roleName) {
              global.ALW.toast.warning('اختر دورًا');
              return;
            }
            modal.setBusy(true);
            global.ALW.api
              .post('/employees/' + employee.id + '/roles', { roleName: values.roleName })
              .then(function () {
                modal.close();
                global.ALW.toast.success('تم إسناد الدور');
                if (page && page.refresh) page.refresh();
              })
              .catch(function (error) {
                modal.setBusy(false);
                global.ALW.toast.fromError(error);
              });
          },
        });
        modal.open();
      }

      var page = global.ALW.resourcePage.create({
        title: 'الموظفون',
        icon: 'briefcase',
        description: 'حسابات الفريق: الأدوار والصلاحيات والحالة.',
        endpoint: '/employees',
        search: 'search',
        searchPlaceholder: 'بحث بالاسم أو الهاتف…',
        defaultSort: { by: 'createdAt', order: 'desc' },
        emptyText: 'لا يوجد موظفون.',
        filters: [
          {
            key: 'status', label: 'الحالة',
            options: [
              { value: 'ACTIVE', label: 'نشط' },
              { value: 'SUSPENDED', label: 'موقوف' },
            ],
          },
          { key: 'role', label: 'الدور', options: roleOptions },
        ],
        columns: [
          { key: 'name', label: 'الموظف', render: function (row) { return ui.userCell(row); } },
          { key: 'phone', label: 'الهاتف', render: function (row) { return dom.el('span', { class: 'mono', text: row.phone || '—' }); } },
          {
            key: 'roles', label: 'الأدوار', sortable: false,
            render: function (row) {
              var wrap = document.createElement('div');
              wrap.className = 'tag-list';
              (row.roles || []).forEach(function (name) {
                wrap.appendChild(ui.badge(name, name === 'OWNER' ? 'brand' : 'info'));
              });
              return wrap;
            },
          },
          { key: 'status', label: 'الحالة', render: function (row) { return ui.enumBadge(F.USER_STATUS, row.status); } },
          { key: 'lastLoginAt', label: 'آخر دخول', render: function (row) { return row.lastLoginAt ? F.relative(row.lastLoginAt) : '—'; } },
          { key: 'createdAt', label: 'أُضيف', render: function (row) { return F.dateOnly(row.createdAt); } },
        ],
        form: {
          permission: 'employees.create',
          createLabel: 'إضافة موظف',
          createTitle: 'موظف جديد',
          editTitle: 'تعديل بيانات الموظف',
          size: 'lg',
          intro: 'الصلاحيات تُمنح عبر الدور. لا يمكن إنشاء دور أعلى من صلاحياتك.',
          fields: [
            { name: 'firstName', label: 'الاسم الأول', required: true, maxLength: 60 },
            { name: 'lastName', label: 'اسم العائلة', required: true, maxLength: 60 },
            { name: 'phone', label: 'الهاتف', required: true, maxLength: 20 },
            { name: 'email', label: 'البريد الإلكتروني (اختياري)' },
            { name: 'roleName', label: 'الدور', type: 'select', required: true, options: roleOptions },
            { name: 'password', label: 'كلمة المرور', type: 'password', required: true, hint: '٨ أحرف على الأقل مع حرف ورقم', autocomplete: 'new-password' },
          ],
          fromRow: function (row) {
            return {
              firstName: row.firstName, lastName: row.lastName, phone: row.phone,
              email: row.email, roleName: (row.roles || [])[0],
            };
          },
          editable: function (row) { return (row.roles || []).indexOf('OWNER') === -1; },
          endpoint: function (row) { return row ? '/employees/' + row.id : '/employees'; },
          toBody: function (values, row) {
            var body = Object.assign({}, values);
            if (row) delete body.password; // الإعداد يعتمد على الدور الجديد بصلاحية منفصلة
            return body;
          },
        },
        rowActions: [
          {
            label: 'إسناد دور',
            icon: 'key',
            permission: 'employees.update',
            visible: function (row) { return (row.roles || []).indexOf('OWNER') === -1; },
            run: function (row) { return Promise.resolve(assignRoleModal(row)); },
          },
          {
            label: 'تعطيل',
            icon: 'user-x',
            permission: 'employees.update',
            visible: function (row) { return row.status === 'ACTIVE' && (row.roles || []).indexOf('OWNER') === -1; },
            confirm: {
              title: 'تعطيل الموظف',
              message: 'سيُمنع من الدخول فورًا وتُبطَل جلساته.',
              tone: 'danger',
              confirmLabel: 'تعطيل',
            },
            run: function (row) { return global.ALW.api.patch('/employees/' + row.id + '/status', { isActive: false }); },
            successMessage: 'تم تعطيل الموظف',
          },
          {
            label: 'تفعيل',
            icon: 'user-check',
            permission: 'employees.update',
            visible: function (row) { return row.status !== 'ACTIVE' && (row.roles || []).indexOf('OWNER') === -1; },
            run: function (row) { return global.ALW.api.patch('/employees/' + row.id + '/status', { isActive: true }); },
            successMessage: 'تم تفعيل الموظف',
          },
        ],
        detail: {
          title: function (row) { return F.fullName(row); },
          endpoint: function (row) { return '/employees/' + row.id; },
          render: function (employee) {
            var nodes = [];
            nodes.push(ui.detailGrid([
              ['المُعرِّف', ui.copyable(employee.id, { mono: true })],
              ['الهاتف', employee.phone || '—'],
              ['البريد', employee.email || '—'],
              ['الحالة', ui.enumBadge(F.USER_STATUS, employee.status)],
              ['آخر دخول', employee.lastLoginAt ? F.dateTime(employee.lastLoginAt) : '—'],
              ['أُضيف', F.dateTime(employee.createdAt)],
            ]));
            var rolesWrap = document.createElement('div');
            rolesWrap.className = 'tag-list';
            ((employee.rolesDetailed || []).length
              ? employee.rolesDetailed
              : (employee.roles || []).map(function (name) { return { role: { name: name } }; })
            ).forEach(function (entry) {
              var name = (entry.role && entry.role.name) || entry.roleName || '—';
              var chip = ui.badge(name, 'info', { small: true });
              if (global.ALW.can.can('employees.update') && name !== 'OWNER') {
                var remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'chip__x';
                remove.title = 'سحب الدور';
                remove.appendChild(dom.icon('x', 'icon icon--sm'));
                remove.addEventListener('click', function () {
                  global.ALW.modal
                    .confirm({
                      title: 'سحب الدور',
                      message: 'سيُسحب الدور "' + name + '" من الموظف.',
                      tone: 'danger',
                      confirmLabel: 'سحب',
                      onConfirm: function () { return global.ALW.api.del('/employees/' + employee.id + '/roles/' + (entry.roleId || (entry.role && entry.role.id))); },
                    })
                    .then(function (confirmed) {
                      if (confirmed) {
                        global.ALW.toast.success('تم سحب الدور');
                        if (page && page.refresh) page.refresh();
                      }
                    });
                });
                chip.appendChild(remove);
              }
              rolesWrap.appendChild(chip);
            });
            nodes.push(ui.card({ title: 'الأدوار', icon: 'key', body: rolesWrap }));
            return nodes;
          },
        },
      });
      return page;
    });
  }

  /* ------------------------------- verification ----------------------------- */
  function verificationPage() {
    return global.ALW.resourcePage.create({
      title: 'تحقق العملاء',
      icon: 'shield',
      description: 'طلبات توثيق العملاء. لا يوجد مزوّد خارجي — التوثيق بقرار موظف موثّق.',
      endpoint: '/admin/verifications',
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: 'لا توجد طلبات تحقق.',
      notice: 'المزوّد الحالي (LOG) لا يوثّق أحدًا تلقائيًا. الانتقال إلى «موثَّق» يحتاج قرار موظف هنا.',
      filters: [
        {
          key: 'status', label: 'الحالة',
          options: [
            { value: 'PENDING', label: 'قيد الانتظار' },
            { value: 'IN_REVIEW', label: 'قيد المراجعة' },
            { value: 'VERIFIED', label: 'موثَّق' },
            { value: 'REJECTED', label: 'مرفوض' },
            { value: 'EXPIRED', label: 'منتهي' },
            { value: 'CANCELLED', label: 'ملغى' },
          ],
        },
      ],
      columns: [
        {
          key: 'id', label: 'الطلب',
          render: function (row) {
            var wrap = document.createElement('div');
            var id = document.createElement('div');
            id.className = 'table__primary mono';
            id.textContent = F.shortId(row.id, 12);
            wrap.appendChild(id);
            var sub = document.createElement('div');
            sub.className = 'table__sub';
            sub.textContent = 'محاولة ' + F.number(row.attempt || 1);
            wrap.appendChild(sub);
            return wrap;
          },
        },
        { key: 'status', label: 'الحالة', render: function (row) { return ui.enumBadge(F.VERIFICATION_STATUS, row.status); } },
        { key: 'provider', label: 'المزوّد', render: function (row) { return ui.badge(row.provider || '—', row.provider === 'LOG' ? 'neutral' : 'info'); } },
        { key: 'userId', label: 'العميل', render: function (row) { return ui.copyable(F.shortId(row.userId, 12)); } },
        { key: 'submittedAt', label: 'أُرسل', render: function (row) { return row.submittedAt ? F.dateTime(row.submittedAt) : '—'; } },
        { key: 'expiresAt', label: 'ينتهي', render: function (row) { return row.expiresAt ? F.dateTime(row.expiresAt) : '—'; } },
        { key: 'createdAt', label: 'أُنشئ', render: function (row) { return F.dateTime(row.createdAt); } },
      ],
      rowActions: [
        {
          label: 'بدء المراجعة',
          icon: 'search',
          permission: 'verification.update',
          visible: function (row) { return row.status === 'PENDING'; },
          run: function (row) { return global.ALW.api.post('/admin/verifications/' + row.id + '/review', {}); },
          successMessage: 'تم نقل الطلب إلى المراجعة',
        },
        {
          label: 'توثيق',
          icon: 'shield-check',
          permission: 'verification.update',
          visible: function (row) { return row.status === 'IN_REVIEW'; },
          confirm: {
            title: 'توثيق العميل',
            message: 'قرار موظف يدوي — يُسجَّل باسمك في سجل التدقيق. لا يوجد تحقّق من مزوّد خارجي.',
            tone: 'warning',
            confirmLabel: 'توثيق',
          },
          run: function (row) { return global.ALW.api.post('/admin/verifications/' + row.id + '/verify', {}); },
          successMessage: 'تم توثيق العميل',
        },
        {
          label: 'رفض',
          icon: 'shield-x',
          permission: 'verification.update',
          visible: function (row) { return row.status === 'IN_REVIEW'; },
          form: {
            title: 'رفض طلب التحقق',
            icon: 'shield-x',
            tone: 'danger',
            submitLabel: 'رفض الطلب',
            submitClass: 'btn--danger',
            endpoint: function (row) { return '/admin/verifications/' + row.id + '/reject'; },
            fields: [{ name: 'reason', label: 'سبب الرفض (إلزامي)', required: true, maxLength: 300, full: true }],
            successMessage: 'تم رفض طلب التحقق',
          },
        },
      ],
      detail: {
        title: function (row) { return 'طلب تحقق ' + F.shortId(row.id, 12); },
        endpoint: function (row) { return '/admin/verifications/' + row.id; },
        render: function (verification) {
          return [
            ui.detailGrid([
              ['المُعرِّف', ui.copyable(verification.id, { mono: true })],
              ['العميل', ui.copyable(verification.userId, { mono: true })],
              ['الحالة', ui.enumBadge(F.VERIFICATION_STATUS, verification.status)],
              ['المزوّد', verification.provider || '—'],
              ['مرجع المزوّد', verification.providerReference || '—'],
              ['المحاولة', F.number(verification.attempt || 1)],
              ['بدأ', verification.startedAt ? F.dateTime(verification.startedAt) : '—'],
              ['أُرسل', verification.submittedAt ? F.dateTime(verification.submittedAt) : '—'],
              ['اكتمل', verification.completedAt ? F.dateTime(verification.completedAt) : '—'],
              ['ينتهي', verification.expiresAt ? F.dateTime(verification.expiresAt) : '—'],
              ['سبب الرفض', verification.rejectionReason || '—'],
            ]),
            ui.alertBox('لا تُعرض هنا أي بيانات هوية حساسة — التصميم لا يخزّنها أصلًا.', 'info'),
          ];
        },
      },
    });
  }

  /* ---------------------------------- audit --------------------------------- */
  function auditPage() {
    return global.ALW.resourcePage.create({
      title: 'سجل التدقيق',
      icon: 'activity',
      description: 'سجل دائم لكل عملية إدارية أو أمنية (قراءة فقط).',
      endpoint: '/audit',
      search: false,
      // the audit endpoint accepts no sortBy/sortOrder — keep the table unsorted (server default)
      emptyText: 'لا توجد سجلات مطابقة.',
      filters: [
        {
          key: 'action', label: 'الإجراء',
          options: [
            { value: 'USER_LOGIN', label: 'تسجيل دخول' },
            { value: 'USER_LOGIN_FAILED', label: 'فشل تسجيل دخول' },
            { value: 'PASSWORD_RESET', label: 'إعادة تعيين كلمة المرور' },
            { value: 'ROLE_ASSIGNED', label: 'إسناد دور' },
            { value: 'ROLE_REVOKED', label: 'سحب دور' },
            { value: 'PAYMENT_CONFIRMED', label: 'تأكيد دفعة' },
            { value: 'PAYMENT_REJECTED', label: 'رفض دفعة' },
            { value: 'ORDER_CREATED', label: 'إنشاء طلب' },
            { value: 'ORDER_CANCELLED', label: 'إلغاء طلب' },
            { value: 'INVENTORY_ADJUSTED', label: 'تسوية مخزون' },
            { value: 'VERIFICATION_VERIFIED', label: 'توثيق عميل' },
          ],
        },
      ],
      columns: [
        {
          key: 'action', label: 'الإجراء',
          render: function (row) {
            var wrap = document.createElement('div');
            var label = document.createElement('div');
            label.className = 'table__primary';
            label.textContent = F.enumLabel(F.AUDIT_ACTION, row.action);
            wrap.appendChild(label);
            var code = document.createElement('div');
            code.className = 'table__sub mono';
            code.textContent = row.action;
            wrap.appendChild(code);
            return wrap;
          },
        },
        { key: 'entity', sortable: false, label: 'الكيان', render: function (row) { return F.enumLabel(F.ENTITY_LABEL, row.entity); } },
        {
          key: 'entityId', label: 'معرّف الكيان',
          render: function (row) { return row.entityId ? ui.copyable(F.shortId(row.entityId, 12)) : '—'; },
        },
        {
          key: 'user', label: 'المنفّذ',
          render: function (row) {
            if (!row.user) return ui.badge('محذوف/مجهول', 'neutral');
            return ui.userCell({ firstName: row.user.firstName, lastName: row.user.lastName, phone: row.user.phone }, { small: true });
          },
        },
        { key: 'ip', sortable: false, label: 'IP', render: function (row) { return dom.el('span', { class: 'mono', text: row.ip || '—' }); } },
        { key: 'createdAt', sortable: false, label: 'التاريخ', render: function (row) { return F.dateTime(row.createdAt); } },
      ],
      detail: {
        title: function (row) { return F.enumLabel(F.AUDIT_ACTION, row.action); },
        endpoint: function (row) { return '/audit'; },
        load: function (row) { return Promise.resolve(row); },
        render: function (entry) {
          var metadata = entry.metadata || {};
          var metadataKeys = Object.keys(metadata).filter(function (key) {
            return !/password|token|secret|hash|authorization/i.test(key);
          });
          var metadataNode = metadataKeys.length
            ? dom.el('div', {}, metadataKeys.map(function (key) {
              return ui.statRow(key, String(metadata[key]), { mono: true });
            }))
            : global.ALW.feedback.state({ compact: true, icon: 'info', title: 'لا بيانات إضافية', text: 'لا ميتاداتا مسجّلة لهذا الحدث.' });
          return [
            ui.detailGrid([
              ['الإجراء', F.enumLabel(F.AUDIT_ACTION, entry.action)],
              ['الرمز', entry.action],
              ['الكيان', F.enumLabel(F.ENTITY_LABEL, entry.entity)],
              ['معرّف الكيان', entry.entityId || '—'],
              ['المنفّذ', entry.user ? F.fullName(entry.user) : '—'],
              ['IP', entry.ip || '—'],
              ['المتصفح', entry.userAgent || '—'],
              ['التاريخ', F.dateTime(entry.createdAt)],
            ]),
            ui.card({ title: 'الميتاداتا (منقّاة)', icon: 'hash', body: metadataNode }),
            ui.alertBox('سجل التدقيق قابل للقراءة فقط — لا يمكن تعديله أو حذفه من الواجهة.', 'info'),
          ];
        },
      },
    });
  }

  /* ------------------------------- notifications ---------------------------- */
  function notificationsPage() {
    return global.ALW.resourcePage.create({
      title: 'الإشعارات',
      icon: 'bell',
      description: 'صندوق إشعاراتك: الحالة، القراءة، والتفضيلات.',
      endpoint: '/notifications',
      search: false,
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: 'لا إشعارات.',
      filters: [
        {
          key: 'read', label: 'القراءة',
          options: [
            { value: 'false', label: 'غير مقروء' },
            { value: 'true', label: 'مقروء' },
          ],
        },
      ],
      headerActions: [
        function (ctx) {
          return ui.button({
            label: 'تعليم الكل كمقروء',
            icon: 'check',
            onClick: function () {
              global.ALW.api
                .post('/notifications/read-all')
                .then(function () {
                  global.ALW.toast.success('تم تعليم كل الإشعارات كمقروءة');
                  if (ctx.refresh) ctx.refresh();
                })
                .catch(function (error) { global.ALW.toast.fromError(error); });
            },
          });
        },
        function () {
          return ui.button({
            label: 'التفضيلات',
            icon: 'settings',
            onClick: openPreferences,
          });
        },
      ],
      columns: [
        {
          key: 'title', label: 'الإشعار',
          render: function (row) {
            var meta = F.NOTIFICATION_TYPE[row.type] || { icon: 'bell' };
            var wrap = document.createElement('div');
            wrap.className = 'user-cell';
            var box = document.createElement('span');
            box.className = 'avatar avatar--sm';
            box.appendChild(dom.icon(meta.icon || 'bell', 'icon icon--sm'));
            wrap.appendChild(box);
            var text = document.createElement('div');
            var title = document.createElement('div');
            title.className = 'table__primary';
            title.textContent = row.title;
            text.appendChild(title);
            var body = document.createElement('div');
            body.className = 'table__sub truncate';
            body.textContent = row.body;
            text.appendChild(body);
            wrap.appendChild(text);
            return wrap;
          },
        },
        { key: 'type', label: 'النوع', render: function (row) { return ui.enumBadge(F.NOTIFICATION_TYPE, row.type); } },
        { key: 'deliveryStatus', label: 'التسليم', render: function (row) { return ui.enumBadge(F.DELIVERY_STATUS, row.deliveryStatus); } },
        { key: 'read', label: 'القراءة', render: function (row) { return row.read ? ui.badge('مقروء', 'neutral') : ui.badge('جديد', 'info'); } },
        { key: 'createdAt', label: 'التاريخ', render: function (row) { return F.relative(row.createdAt); } },
      ],
      rowActions: [
        {
          label: 'تعليم كمقروء',
          icon: 'check',
          visible: function (row) { return !row.read; },
          run: function (row) { return global.ALW.api.post('/notifications/' + row.id + '/read', {}); },
          successMessage: 'تم التعليم كمقروء',
        },
      ],
      detail: {
        title: function (row) { return row.title; },
        endpoint: function (row) { return '/notifications/' + row.id; },
        render: function (notification) {
          return [
            ui.detailGrid([
              ['النوع', F.enumLabel(F.NOTIFICATION_TYPE, notification.type)],
              ['القناة', notification.channel],
              ['حالة التسليم', ui.enumBadge(F.DELIVERY_STATUS, notification.deliveryStatus)],
              ['القراءة', notification.read ? 'مقروء — ' + F.dateTime(notification.readAt) : 'غير مقروء'],
              ['أُنشئ', F.dateTime(notification.createdAt)],
              ['سُلِّم', notification.deliveredAt ? F.dateTime(notification.deliveredAt) : '—'],
            ]),
            ui.card({ title: 'النص', body: notification.body }),
            ui.alertBox('الإشعار محفوظ داخل التطبيق فقط (IN_APP) — لا يوجد إرسال بريد أو SMS.', 'info'),
          ];
        },
      },
    });
  }

  function openPreferences() {
    var body = document.createElement('div');
    body.className = 'stack';
    body.appendChild(global.ALW.feedback.skeletonRows(5, '34px'));
    var modal = global.ALW.modal.create({ title: 'تفضيلات الإشعارات', icon: 'settings', size: 'sm', content: body });
    modal.addFooterButton({ label: 'إغلاق', className: 'btn--secondary', onClick: function () { modal.close(); } });
    modal.open();

    function load() {
      global.ALW.api
        .get('/notifications/preferences')
        .then(function (data) {
          var items = (data && data.items) || [];
          var rows = items.map(function (item) {
            var row = document.createElement('div');
            row.className = 'stat-row';
            var label = document.createElement('span');
            label.className = 'stat-row__label';
            label.textContent = F.enumLabel(F.NOTIFICATION_TYPE, item.type);
            row.appendChild(label);
            if (item.mandatory) {
              row.appendChild(ui.badge('إلزامي', 'info'));
              return row;
            }
            var toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = item.inAppEnabled;
            toggle.style.width = '42px';
            toggle.style.height = '24px';
            toggle.addEventListener('change', function () {
              toggle.disabled = true;
              global.ALW.api
                .patch('/notifications/preferences', { type: item.type, inAppEnabled: toggle.checked })
                .then(function () {
                  global.ALW.toast.success('تم تحديث التفضيل');
                })
                .catch(function (error) {
                  toggle.checked = !toggle.checked;
                  global.ALW.toast.fromError(error);
                })
                .then(function () {
                  toggle.disabled = false;
                });
            });
            row.appendChild(toggle);
            return row;
          });
          dom.mount(body, items.length
            ? [ui.alertBox('الإشعارات الإلزامية مرتبطة بعمليات مالية/أمنية ولا يمكن تعطيلها.', 'info')].concat(rows)
            : [global.ALW.feedback.empty('لا توجد تفضيلات.')]);
        })
        .catch(function (error) {
          dom.mount(body, [global.ALW.feedback.errorState(error, load)]);
        });
    }
    load();
  }

  /* --------------------------- admin notification inbox ---------------------- */
  function adminNotificationsPage() {
    var page = global.ALW.resourcePage.create({
      title: 'طابور الإشعارات (إدارة)',
      icon: 'inbox',
      description: 'كل الإشعارات المولَّدة على المنصة — للمراجعة والتشخيص.',
      endpoint: '/admin/notifications',
      search: false,
      defaultSort: { by: 'createdAt', order: 'desc' },
      emptyText: 'لا إشعارات.',
      headerActions: [
        function (ctx) {
          return ui.button({
            label: 'معالجة صندوق الصادر',
            icon: 'refresh',
            permission: 'notifications.admin.read',
            onClick: function (ctx2) {
              global.ALW.api
                .post('/admin/notifications/outbox/process', {})
                .then(function (result) {
                  global.ALW.toast.success('تمت معالجة ' + ((result && result.processed) || 0) + ' حدثًا');
                  if (ctx.refresh) ctx.refresh();
                })
                .catch(function (error) { global.ALW.toast.fromError(error); });
            },
          });
        },
      ],
      filters: [
        { key: 'type', label: 'النوع', options: Object.keys(F.NOTIFICATION_TYPE).map(function (key) { return { value: key, label: F.enumLabel(F.NOTIFICATION_TYPE, key) }; }) },
        { key: 'read', label: 'القراءة', options: [{ value: 'false', label: 'غير مقروء' }, { value: 'true', label: 'مقروء' }] },
      ],
      columns: [
        { key: 'title', label: 'الإشعار', render: function (row) { return dom.el('span', { class: 'table__primary', text: row.title }); } },
        { key: 'type', label: 'النوع', render: function (row) { return ui.enumBadge(F.NOTIFICATION_TYPE, row.type); } },
        { key: 'userId', label: 'المستلم', render: function (row) { return ui.copyable(F.shortId(row.userId, 12)); } },
        { key: 'deliveryStatus', label: 'التسليم', render: function (row) { return ui.enumBadge(F.DELIVERY_STATUS, row.deliveryStatus); } },
        { key: 'read', label: 'القراءة', render: function (row) { return row.read ? ui.badge('مقروء', 'neutral') : ui.badge('جديد', 'info'); } },
        { key: 'createdAt', label: 'التاريخ', render: function (row) { return F.dateTime(row.createdAt); } },
      ],
    });
    return page;
  }

  var api = {
    orders: ordersPage,
    payments: paymentsPage,
    shamCashReview: function () {
      return paymentsPage({
        title: 'مراجعة شام كاش',
        description: 'الدفعات المرسلة بمرجع تحويل وإثبات — بانتظار قرار موظف.',
        initialFilters: { status: 'PENDING_REVIEW' },
        emptyText: 'لا توجد دفعات بانتظار المراجعة. 🎉',
        notice: 'التأكيد هنا تسجيل يدوي لوصول التحويل — لا يتصل النظام بأي مزوّد دفع ولا يتحقق آليًا من المرجع.',
      });
    },
    customers: customersPage,
    employees: employeesPage,
    verification: verificationPage,
    audit: auditPage,
    notifications: notificationsPage,
    adminNotifications: adminNotificationsPage,
    openPreferences: openPreferences,
  };

  global.ALW = global.ALW || {};
  global.ALW.pagesOps = api;
})(typeof window !== 'undefined' ? window : globalThis);
