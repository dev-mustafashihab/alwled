/**
 * alwled — صفحات الكتالوج والمخزون (تصنيفات · علامات · مواصفات · منتجات · مخزون)
 * كل الصفحات مبنية من نفس المصنع (resourcePage) فتتشارك الجدول والنماذج والحالات.
 */
(function (global) {
  'use strict';

  var F = global.ALW.format;
  var ui = global.ALW.ui;
  var dom = global.ALW.dom;

  /* ------------------------- shared helpers/loaders ------------------------- */

  var optionsCache = null;

  /** تصنيفات/علامات للنماذج والفلاتر — تُحمَّل مرة واحدة لكل جلسة. */
  function loadOptions(force) {
    if (optionsCache && !force) return Promise.resolve(optionsCache);
    return Promise.all([
      global.ALW.api.get('/categories', { query: { limit: 100, includeInactive: true } }),
      global.ALW.api.get('/brands', { query: { limit: 100, includeInactive: true } }),
    ]).then(function (results) {
      var categories = (results[0] && results[0].items) || [];
      var brands = (results[1] && results[1].items) || [];
      optionsCache = {
        categories: categories,
        brands: brands,
        categoryOptions: categories.map(function (item) { return { value: item.id, label: item.name }; }),
        brandOptions: brands.map(function (item) { return { value: item.id, label: item.name }; }),
      };
      return optionsCache;
    });
  }

  function invalidateOptions() {
    optionsCache = null;
  }

  /**
   * صفحة تحتاج بيانات مساعدة: تُعرض حالة تحميل ثم تُستبدل بالصفحة الجاهزة.
   */
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
          page._container = container;
          container.__page = page;
        })
        .catch(function (error) {
          dom.mount(container, [
            global.ALW.feedback.errorState(error, function () {
              build();
            }),
          ]);
        });
    }

    build();

    return {
      container: container,
      refresh: function () {
        var page = container.__page;
        if (page && page.refresh) return page.refresh();
        return build();
      },
      openForm: function (row) {
        var page = container.__page;
        return page && page.openForm ? page.openForm(row) : null;
      },
    };
  }

  function activeBadge(value) {
    return ui.badge(value ? 'نشط' : 'معطَّل', value ? 'success' : 'neutral');
  }

  function nameCell(row, icon) {
    var wrap = document.createElement('div');
    wrap.className = 'user-cell';
    if (icon) {
      var box = document.createElement('span');
      box.className = 'avatar avatar--sm';
      box.appendChild(dom.icon(icon, 'icon icon--sm'));
      wrap.appendChild(box);
    }
    var text = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'table__primary';
    name.textContent = row.name || '—';
    text.appendChild(name);
    if (row.shortDescription) {
      var sub = document.createElement('div');
      sub.className = 'table__sub truncate';
      sub.textContent = row.shortDescription;
      text.appendChild(sub);
    }
    wrap.appendChild(text);
    return wrap;
  }

  /* --------------------------------- categories ----------------------------- */
  function categoriesPage() {
    return deferred(loadOptions, function (options) {
      var definition = {
        title: 'التصنيفات',
        icon: 'layers',
        description: 'شجرة تصنيفات المنتجات مع دعم التصنيف الأب والترتيب.',
        endpoint: '/categories',
        search: 'search',
        searchPlaceholder: 'بحث بالاسم…',
        defaultSort: { by: 'sortOrder', order: 'asc' },
        pageSize: 50,
        emptyText: 'لا توجد تصنيفات بعد — أضف أول تصنيف لتبدأ.',
        filters: [
          { key: 'includeInactive', label: 'العرض', options: [{ value: 'true', label: 'إظهار المعطَّلة' }] },
          { key: 'parentId', label: 'التصنيف الأب', options: options.categoryOptions },
        ],
        columns: [
          { key: 'name', label: 'التصنيف', render: function (row) { return nameCell(row, 'layers'); } },
          { key: 'slug', label: 'المُعرِّف', render: function (row) { return dom.el('span', { class: 'mono', text: row.slug }); } },
          { key: 'parent', label: 'الأب', render: function (row) { return row.parent ? row.parent.name : '—'; } },
          { key: 'childrenCount', label: 'أبناء', render: function (row) { return F.number(row.childrenCount); } },
          { key: 'productsCount', label: 'منتجات', render: function (row) { return F.number(row.productsCount); } },
          { key: 'sortOrder', label: 'الترتيب' },
          { key: 'isActive', label: 'الحالة', render: function (row) { return activeBadge(row.isActive); } },
        ],
        form: {
          permission: 'categories.create',
          createLabel: 'إضافة تصنيف',
          createTitle: 'تصنيف جديد',
          editTitle: 'تعديل التصنيف',
          size: 'lg',
          fields: [
            { name: 'name', label: 'اسم التصنيف', required: true, maxLength: 120 },
            { name: 'slug', label: 'المُعرِّف (اختياري)', hint: 'يُنشأ تلقائيًا إن تُرك فارغًا' },
            {
              name: 'parentId', label: 'التصنيف الأب', type: 'select',
              options: [{ value: '', label: '— تصنيف رئيسي —' }].concat(options.categoryOptions),
            },
            { name: 'sortOrder', label: 'ترتيب العرض', type: 'number', min: 0 },
            { name: 'image', label: 'رابط الصورة (اختياري)' },
            { name: 'description', label: 'الوصف', type: 'textarea', full: true },
            { name: 'isActive', label: 'تصنيف نشط', type: 'switch', value: true },
          ],
          fromRow: function (row) {
            return { name: row.name, slug: row.slug, parentId: row.parentId, sortOrder: row.sortOrder, image: row.image, description: row.description, isActive: row.isActive };
          },
          endpoint: function (row) { return row ? '/categories/' + row.id : '/categories'; },
          toBody: function (values) {
            var body = Object.assign({}, values);
            if (body.parentId === '' || body.parentId === undefined) body.parentId = null;
            else body.parentId = Number(body.parentId);
            if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder);
            return body;
          },
        },
        rowActions: [
          {
            label: 'تعطيل',
            icon: 'circle-slash',
            permission: 'categories.delete',
            visible: function (row) { return row.isActive; },
            confirm: {
              title: 'تعطيل التصنيف',
              message: 'لن يظهر التصنيف في المتجر. المنتجات المرتبطة لا تُحذف.',
              tone: 'danger',
              confirmLabel: 'تعطيل',
            },
            run: function (row) { return global.ALW.api.patch('/categories/' + row.id, { isActive: false }); },
            successMessage: 'تم تعطيل التصنيف',
          },
        ],
        detail: {
          title: function (row) { return row.name; },
          endpoint: function (row) { return '/categories/' + row.id; },
          render: function (data) {
            return [
              ui.detailGrid([
                ['الاسم', data.name],
                ['المُعرِّف', data.slug],
                ['التصنيف الأب', data.parent ? data.parent.name : '—'],
                ['عدد المنتجات', F.number(data.productsCount)],
                ['عدد الأبناء', F.number(data.childrenCount)],
                ['الترتيب', F.number(data.sortOrder)],
                ['الحالة', activeBadge(data.isActive)],
                ['أُنشئ', F.dateTime(data.createdAt)],
              ]),
              data.description ? ui.card({ title: 'الوصف', body: data.description }) : null,
            ];
          },
        },
      };
      return global.ALW.resourcePage.create(definition);
    });
  }

  /* ----------------------------------- brands ------------------------------- */
  function brandsPage() {
    return global.ALW.resourcePage.create({
      title: 'العلامات التجارية',
      icon: 'tag',
      description: 'العلامات المرتبطة بالمنتجات.',
      endpoint: '/brands',
      search: 'search',
      searchPlaceholder: 'بحث بالاسم…',
      defaultSort: { by: 'sortOrder', order: 'asc' },
      emptyText: 'لا توجد علامات بعد.',
      filters: [{ key: 'includeInactive', label: 'العرض', options: [{ value: 'true', label: 'إظهار المعطَّلة' }] }],
      columns: [
        { key: 'name', label: 'العلامة', render: function (row) { return nameCell(row, 'tag'); } },
        { key: 'slug', label: 'المُعرِّف', render: function (row) { return dom.el('span', { class: 'mono', text: row.slug }); } },
        { key: 'productsCount', label: 'المنتجات', render: function (row) { return F.number(row.productsCount); } },
        { key: 'sortOrder', label: 'الترتيب' },
        { key: 'isActive', label: 'الحالة', render: function (row) { return activeBadge(row.isActive); } },
      ],
      form: {
        permission: 'brands.create',
        createLabel: 'إضافة علامة',
        createTitle: 'علامة تجارية جديدة',
        editTitle: 'تعديل العلامة',
        fields: [
          { name: 'name', label: 'اسم العلامة', required: true, maxLength: 120 },
          { name: 'slug', label: 'المُعرِّف (اختياري)' },
          { name: 'sortOrder', label: 'ترتيب العرض', type: 'number', min: 0 },
          { name: 'logo', label: 'رابط الشعار (اختياري)' },
          { name: 'description', label: 'الوصف', type: 'textarea', full: true },
          { name: 'isActive', label: 'علامة نشطة', type: 'switch', value: true },
        ],
        fromRow: function (row) {
          return { name: row.name, slug: row.slug, sortOrder: row.sortOrder, logo: row.logo, description: row.description, isActive: row.isActive };
        },
        endpoint: function (row) { return row ? '/brands/' + row.id : '/brands'; },
        toBody: function (values) {
          var body = Object.assign({}, values);
          if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder);
          return body;
        },
      },
      rowActions: [
        {
          label: 'تعطيل',
          icon: 'circle-slash',
          permission: 'brands.delete',
          visible: function (row) { return row.isActive; },
          confirm: {
            title: 'تعطيل العلامة',
            message: 'لن تظهر العلامة في المتجر. المنتجات المرتبطة لا تُحذف.',
            tone: 'danger',
            confirmLabel: 'تعطيل',
          },
          run: function (row) { return global.ALW.api.patch('/brands/' + row.id, { isActive: false }); },
          successMessage: 'تم تعطيل العلامة',
        },
      ],
    });
  }

  /* ------------------------------ specifications ---------------------------- */
  function specificationsPage() {
    return deferred(loadOptions, function (options) {
      return global.ALW.resourcePage.create({
        title: 'المواصفات',
        icon: 'sliders',
        description: 'خصائص المنتجات (نص · رقم · نعم/لا · قائمة خيارات).',
        endpoint: '/specifications',
        search: 'search',
        searchPlaceholder: 'بحث بالاسم…',
        serverSort: false, // /specifications has no sortBy/sortOrder parameters
        emptyText: 'لا توجد مواصفات معرّفة.',
        filters: [{ key: 'categoryId', label: 'التصنيف', options: options.categoryOptions }],
        columns: [
          { key: 'name', label: 'المواصفة', render: function (row) { return nameCell(row, 'sliders'); } },
          { key: 'key', label: 'المفتاح', render: function (row) { return dom.el('span', { class: 'mono', text: row.key }); } },
          {
            key: 'type', label: 'النوع',
            render: function (row) {
              var labels = { TEXT: 'نص', NUMBER: 'رقم', BOOLEAN: 'نعم/لا', SELECT: 'قائمة خيارات' };
              return ui.badge(labels[row.type] || row.type, 'brand');
            },
          },
          { key: 'unit', label: 'الوحدة', render: function (row) { return row.unit || '—'; } },
          { key: 'category', label: 'التصنيف', render: function (row) { return row.category ? row.category.name : 'عام'; } },
          { key: 'productsCount', label: 'المنتجات', render: function (row) { return F.number(row.productsCount); } },
          { key: 'isActive', label: 'الحالة', render: function (row) { return activeBadge(row.isActive); } },
        ],
        form: {
          permission: 'specifications.create',
          createLabel: 'إضافة مواصفة',
          createTitle: 'مواصفة جديدة',
          editTitle: 'تعديل المواصفة',
          size: 'lg',
          fields: [
            { name: 'name', label: 'اسم المواصفة', required: true, maxLength: 120, placeholder: 'مثال: السعة' },
            { name: 'key', label: 'المفتاح البرمجي (اختياري)', placeholder: 'capacity' },
            {
              name: 'type', label: 'نوع القيمة', type: 'select', required: true, value: 'TEXT',
              options: [
                { value: 'TEXT', label: 'نص' },
                { value: 'NUMBER', label: 'رقم' },
                { value: 'BOOLEAN', label: 'نعم/لا' },
                { value: 'SELECT', label: 'قائمة خيارات' },
              ],
            },
            { name: 'unit', label: 'الوحدة (اختياري)', placeholder: 'لتر' },
            {
              name: 'categoryId', label: 'التصنيف (اختياري)', type: 'select',
              options: [{ value: '', label: '— عام —' }].concat(options.categoryOptions),
            },
            { name: 'sortOrder', label: 'ترتيب العرض', type: 'number', min: 0 },
            { name: 'optionsText', label: 'خيارات القائمة (سطر لكل خيار)', type: 'textarea', full: true, hint: 'تُستخدم فقط مع نوع «قائمة خيارات»' },
            { name: 'isActive', label: 'مواصفة نشطة', type: 'switch', value: true },
          ],
          fromRow: function (row) {
            return {
              name: row.name, key: row.key, type: row.type, unit: row.unit, categoryId: row.categoryId,
              sortOrder: row.sortOrder, optionsText: (row.options || []).join('\n'), isActive: row.isActive,
            };
          },
          endpoint: function (row) { return row ? '/specifications/' + row.id : '/specifications'; },
          toBody: function (values) {
            var body = Object.assign({}, values);
            delete body.optionsText;
            if (values.optionsText) {
              body.options = String(values.optionsText).split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
            }
            if (body.categoryId === '' || body.categoryId === undefined) body.categoryId = null;
            else body.categoryId = Number(body.categoryId);
            if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder);
            return body;
          },
        },
        rowActions: [
          {
            label: 'تعطيل',
            icon: 'circle-slash',
            permission: 'specifications.delete',
            visible: function (row) { return row.isActive; },
            confirm: { title: 'تعطيل المواصفة', message: 'لن تُتاح عند إضافة منتجات جديدة.', tone: 'danger', confirmLabel: 'تعطيل' },
            run: function (row) { return global.ALW.api.patch('/specifications/' + row.id, { isActive: false }); },
            successMessage: 'تم تعطيل المواصفة',
          },
        ],
      });
    });
  }

  /* --------------------------------- products ------------------------------- */
  function productsPage() {
    return deferred(loadOptions, function (options) {
      var page;
      var definition = {
        title: 'المنتجات',
        icon: 'package',
        description: 'كتالوج المنتجات: الأسعار والتصنيفات والعلامات والصور والمخزون.',
        endpoint: '/products',
        search: 'search',
        searchPlaceholder: 'بحث بالاسم أو SKU…',
        defaultSort: { by: 'createdAt', order: 'desc' },
        emptyText: 'لا توجد منتجات — أضف أول منتج.',
        filters: [
          { key: 'categoryId', label: 'التصنيف', options: options.categoryOptions },
          { key: 'brandId', label: 'العلامة', options: options.brandOptions },
          { key: 'isActive', label: 'الحالة', options: [{ value: 'true', label: 'نشط' }, { value: 'false', label: 'معطَّل' }] },
        ],
        query: function (params) {
          return Object.assign({}, params, { includeInactive: true });
        },
        columns: [
          {
            key: 'name', label: 'المنتج',
            render: function (row) {
              var wrap = document.createElement('div');
              wrap.className = 'user-cell';
              wrap.appendChild(ui.thumb(row.primaryImage && row.primaryImage.url, row.name));
              var text = document.createElement('div');
              var name = document.createElement('div');
              name.className = 'table__primary';
              name.textContent = row.name;
              text.appendChild(name);
              var sub = document.createElement('div');
              sub.className = 'table__sub mono';
              sub.textContent = row.sku || '—';
              text.appendChild(sub);
              wrap.appendChild(text);
              return wrap;
            },
          },
          { key: 'category', label: 'التصنيف', render: function (row) { return row.category ? row.category.name : '—'; } },
          { key: 'brand', label: 'العلامة', render: function (row) { return row.brand ? row.brand.name : '—'; } },
          {
            key: 'price', label: 'السعر',
            render: function (row) {
              var wrap = document.createElement('div');
              wrap.appendChild(ui.moneyCell(row.price, 'USD'));
              if (row.hasDiscount) {
                var old = document.createElement('div');
                old.className = 'table__sub';
                old.style.textDecoration = 'line-through';
                old.textContent = F.money(row.compareAtPrice, 'USD');
                wrap.appendChild(old);
              }
              return wrap;
            },
          },
          { key: 'isActive', label: 'الحالة', render: function (row) { return activeBadge(row.isActive); } },
          { key: 'isFeatured', label: 'مميّز', render: function (row) { return row.isFeatured ? ui.badge('مميّز', 'brand') : '—'; } },
          { key: 'createdAt', label: 'أُضيف', render: function (row) { return F.dateOnly(row.createdAt); } },
        ],
        form: {
          permission: 'products.create',
          createLabel: 'إضافة منتج',
          createTitle: 'منتج جديد',
          editTitle: 'تعديل المنتج',
          size: 'lg',
          fields: [
            { name: 'name', label: 'اسم المنتج', required: true, maxLength: 200, full: true },
            { name: 'sku', label: 'رمز المنتج (SKU)', required: true, maxLength: 60, hint: 'يجب أن يكون فريدًا' },
            { name: 'price', label: 'السعر', type: 'number', required: true, min: 0, step: '0.01' },
            { name: 'compareAtPrice', label: 'السعر قبل الخصم (اختياري)', type: 'number', min: 0, step: '0.01' },
            { name: 'categoryId', label: 'التصنيف', type: 'select', required: true, options: options.categoryOptions },
            { name: 'brandId', label: 'العلامة', type: 'select', required: true, options: options.brandOptions },
            { name: 'shortDescription', label: 'وصف مختصر', maxLength: 300, full: true },
            { name: 'description', label: 'الوصف الكامل', type: 'textarea', full: true },
            { name: 'isActive', label: 'منتج نشط', type: 'switch', value: true },
            { name: 'isFeatured', label: 'منتج مميّز', type: 'switch', value: false },
          ],
          fromRow: function (row) {
            return {
              name: row.name, sku: row.sku, price: F.parseMoney(row.price).amount,
              compareAtPrice: row.compareAtPrice ? F.parseMoney(row.compareAtPrice).amount : undefined,
              categoryId: row.category && row.category.id, brandId: row.brand && row.brand.id,
              shortDescription: row.shortDescription, description: row.description,
              isActive: row.isActive, isFeatured: row.isFeatured,
            };
          },
          endpoint: function (row) { return row ? '/products/' + row.id : '/products'; },
          toBody: function (values) {
            var body = Object.assign({}, values);
            ['price', 'compareAtPrice', 'categoryId', 'brandId'].forEach(function (key) {
              if (body[key] !== undefined && body[key] !== '') body[key] = Number(body[key]);
            });
            if (!body.sku) delete body.sku; // the server generates one when omitted
            return body;
          },
        },
        rowActions: [
          {
            label: 'تعطيل',
            icon: 'circle-slash',
            permission: 'products.update',
            visible: function (row) { return row.isActive; },
            confirm: { title: 'تعطيل المنتج', message: 'لن يظهر المنتج في المتجر. الطلبات السابقة لا تتأثر.', tone: 'danger', confirmLabel: 'تعطيل' },
            run: function (row) { return global.ALW.api.patch('/products/' + row.id, { isActive: false }); },
            successMessage: 'تم تعطيل المنتج',
          },
          {
            label: 'تفعيل',
            icon: 'check-circle',
            permission: 'products.update',
            visible: function (row) { return !row.isActive; },
            run: function (row) { return global.ALW.api.patch('/products/' + row.id, { isActive: true }); },
            successMessage: 'تم تفعيل المنتج',
          },
        ],
        detail: {
          title: function (row) { return row.name; },
          size: 'lg',
          load: function (row) {
            return global.ALW.api.get('/products/' + row.id).then(function (product) {
              return global.ALW.api
                .get('/inventory/' + row.id)
                .then(function (inventory) { return { product: product, inventory: inventory }; })
                .catch(function () { return { product: product, inventory: null }; });
            });
          },
          render: function (data, ctx) {
            var product = data.product || {};
            var inventory = data.inventory;
            var nodes = [];
            nodes.push(ui.detailGrid([
              ['SKU', product.sku || '—'],
              ['السعر', F.money(product.price, 'USD')],
              ['السعر قبل الخصم', product.compareAtPrice ? F.money(product.compareAtPrice, 'USD') : '—'],
              ['التصنيف', product.category ? product.category.name : '—'],
              ['العلامة', product.brand ? product.brand.name : '—'],
              ['الحالة', activeBadge(product.isActive)],
              ['مميّز', product.isFeatured ? 'نعم' : 'لا'],
              ['أُنشئ', F.dateTime(product.createdAt)],
            ]));
            if (product.shortDescription || product.description) {
              nodes.push(ui.card({
                title: 'الوصف',
                body: [product.shortDescription, product.description].filter(Boolean).join('\n\n'),
              }));
            }
            if (inventory) {
              nodes.push(ui.card({
                title: 'المخزون',
                icon: 'boxes',
                body: ui.detailGrid([
                  ['الكمية', F.number(inventory.quantity)],
                  ['المحجوز', F.number(inventory.reservedQuantity)],
                  ['المتاح', F.number(inventory.availableQuantity)],
                  ['حد التنبيه', F.number(inventory.lowStockThreshold)],
                  ['المؤشر', inventory.isOutOfStock ? ui.badge('نفد', 'danger') : inventory.isLowStock ? ui.badge('منخفض', 'warning') : ui.badge('جيد', 'success')],
                ]),
              }));
            }
            var images = product.images || [];
            nodes.push(ui.card({
              title: 'صور المنتج (' + images.length + ')',
              icon: 'image',
              body: images.length
                ? dom.el('div', { class: 'tag-list' }, images.map(function (image) { return ui.thumb(image.url, product.name); }))
                : global.ALW.feedback.state({ compact: true, icon: 'image', title: 'لا صور', text: 'الصور تُضاف كروابط (StorageProvider).' }),
              actions: [
                global.ALW.can.can('products.create')
                  ? ui.button({ label: 'إضافة صورة', icon: 'plus', size: 'sm', onClick: function () { openImageForm(product, ctx); } })
                  : null,
              ].filter(Boolean),
            }));
            return nodes;
          },
          footer: function (modal, row) {
            return [
              global.ALW.can.can('products.update')
                ? ui.button({
                  label: 'تعديل المنتج',
                  icon: 'edit',
                  variant: 'btn--primary',
                  onClick: function () {
                    modal.close();
                    page.openForm(row);
                  },
                })
                : null,
            ].filter(Boolean);
          },
        },
      };

      page = global.ALW.resourcePage.create(definition);

      function openImageForm(product, ctx) {
        var formApi = global.ALW.forms.form({
          grid: true,
          fields: [
            { name: 'url', label: 'رابط الصورة', required: true, placeholder: 'https://…', full: true },
            { name: 'altText', label: 'وصف بديل (alt)' },
            { name: 'sortOrder', label: 'الترتيب', type: 'number', min: 0 },
            { name: 'isPrimary', label: 'صورة رئيسية', type: 'switch' },
          ],
        });
        var modal = global.ALW.modal.create({ title: 'إضافة صورة', icon: 'image', content: formApi.node });
        modal.addFooterButton({ label: 'إلغاء', className: 'btn--secondary', onClick: function () { modal.close(); } });
        modal.addFooterButton({
          label: 'إضافة',
          className: 'btn--primary',
          loading: true,
          onClick: function () {
            var values = formApi.values();
            if (!values.url) {
              global.ALW.toast.warning('رابط الصورة مطلوب');
              return;
            }
            modal.setBusy(true);
            global.ALW.api
              .post('/products/' + product.id + '/images', {
                url: values.url,
                altText: values.altText,
                sortOrder: values.sortOrder ? Number(values.sortOrder) : undefined,
                isPrimary: values.isPrimary === true,
              })
              .then(function () {
                modal.close();
                global.ALW.toast.success('تمت إضافة الصورة');
                if (ctx && ctx.refresh) ctx.refresh();
              })
              .catch(function (error) {
                modal.setBusy(false);
                global.ALW.toast.fromError(error);
              });
          },
        });
        modal.open();
      }

      return page;
    });
  }

  /* -------------------------------- inventory ------------------------------- */
  function inventoryPage() {
    return global.ALW.resourcePage.create({
      title: 'المخزون',
      icon: 'boxes',
      description: 'الكمية والمحجوز والمتاح لكل منتج — التسويات بسبب موثّق وتأكيد صريح.',
      endpoint: '/inventory',
      search: 'search',
      searchPlaceholder: 'بحث بالاسم أو SKU…',
      defaultSort: { by: 'updatedAt', order: 'desc' },
      emptyText: 'لا توجد سجلات مخزون.',
      filters: [
        { key: 'lowStockOnly', label: 'منخفض', options: [{ value: 'true', label: 'المخزون المنخفض فقط' }] },
        { key: 'outOfStockOnly', label: 'نفد', options: [{ value: 'true', label: 'النفاد التام فقط' }] },
      ],
      columns: [
        {
          key: 'product', label: 'المنتج',
          render: function (row) {
            var product = row.product || {};
            var wrap = document.createElement('div');
            wrap.className = 'user-cell';
            wrap.appendChild(ui.thumb(product.primaryImage && product.primaryImage.url, product.name));
            var text = document.createElement('div');
            var name = document.createElement('div');
            name.className = 'table__primary';
            name.textContent = product.name || '—';
            text.appendChild(name);
            var sub = document.createElement('div');
            sub.className = 'table__sub mono';
            sub.textContent = product.sku || '—';
            text.appendChild(sub);
            wrap.appendChild(text);
            return wrap;
          },
        },
        { key: 'quantity', label: 'الكمية', render: function (row) { return dom.el('span', { class: 'tnum', text: F.number(row.quantity) }); } },
        { key: 'reservedQuantity', label: 'المحجوز', render: function (row) { return dom.el('span', { class: 'tnum', text: F.number(row.reservedQuantity) }); } },
        {
          key: 'availableQuantity', label: 'المتاح',
          render: function (row) {
            var node = dom.el('strong', { class: 'tnum', text: F.number(row.availableQuantity) });
            return node;
          },
        },
        { key: 'lowStockThreshold', label: 'حد التنبيه' },
        {
          key: 'status', label: 'المؤشر', sortable: false,
          render: function (row) {
            if (row.isOutOfStock) return ui.badge('نفد المخزون', 'danger');
            if (row.isLowStock) return ui.badge('مخزون منخفض', 'warning');
            return ui.badge('جيد', 'success');
          },
        },
        { key: 'updatedAt', label: 'آخر حركة', render: function (row) { return F.relative(row.updatedAt); } },
      ],
      rowActions: [
        {
          label: 'تسوية المخزون',
          icon: 'sliders',
          permission: 'inventory.adjust',
          form: function (row) {
            return {
              title: 'تسوية مخزون — ' + ((row.product && row.product.name) || ''),
              icon: 'sliders',
              message: 'التسوية تُسجَّل في سجل الحركات باسمك ولا يمكن التراجع عنها تلقائيًا.\nالكمية المتاحة الآن: ' + F.number(row.availableQuantity),
              tone: 'warning',
              submitLabel: 'تنفيذ التسوية',
              endpoint: function () { return '/inventory/' + row.productId + '/adjust'; },
              fields: [
                {
                  name: 'quantity', label: 'الفرق (موجب = إدخال، سالب = إخراج)', type: 'number', required: true,
                  hint: 'لا يقبل الصفر', placeholder: '10 أو -3',
                },
                {
                  name: 'type', label: 'نوع الحركة', type: 'select', value: 'ADJUSTMENT',
                  options: [
                    { value: 'ADJUSTMENT', label: 'تسوية' },
                    { value: 'STOCK_IN', label: 'إدخال مخزون' },
                    { value: 'STOCK_OUT', label: 'إخراج مخزون' },
                  ],
                },
                { name: 'reason', label: 'السبب (إلزامي)', required: true, maxLength: 120, placeholder: 'استلام شحنة مورّد', full: true },
              ],
              toBody: function (values) {
                return { quantity: Number(values.quantity), reason: values.reason, type: values.type };
              },
            };
          },
        },
        {
          label: 'سجل الحركات',
          icon: 'list',
          permission: 'inventory.read',
          run: function (row) { return Promise.resolve(openMovements(row)); },
        },
      ],
    });
  }

  function openMovements(row) {
    var body = document.createElement('div');
    body.className = 'stack';
    body.appendChild(global.ALW.feedback.skeletonRows(5, '40px'));
    var modal = global.ALW.modal.create({
      title: 'سجل الحركات — ' + ((row.product && row.product.name) || ''),
      icon: 'list',
      size: 'lg',
      content: body,
    });
    modal.open();
    global.ALW.api
      .get('/inventory/' + row.productId + '/movements', { query: { limit: 50 } })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          dom.mount(body, [global.ALW.feedback.empty('لا توجد حركات مسجّلة لهذا المنتج.')]);
          return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'table-wrap table-wrap--cards';
        var table = document.createElement('table');
        table.className = 'table table--compact';
        table.innerHTML = '<thead><tr><th>النوع</th><th>الكمية</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>المرجع</th><th>التاريخ</th></tr></thead>';
        var tbody = document.createElement('tbody');
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          [F.enumLabel(F.MOVEMENT_TYPE, item.type), F.number(item.quantity), F.number(item.quantityBefore), F.number(item.quantityAfter), item.referenceType || '—', F.dateTime(item.createdAt)].forEach(function (value, index) {
            var td = document.createElement('td');
            td.setAttribute('data-label', ['النوع', 'الكمية', 'الرصيد قبل', 'الرصيد بعد', 'المرجع', 'التاريخ'][index]);
            td.textContent = value;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        dom.mount(body, [wrap]);
      })
      .catch(function (error) {
        dom.mount(body, [global.ALW.feedback.errorState(error)]);
      });
    return modal;
  }

  var api = {
    categories: categoriesPage,
    brands: brandsPage,
    specifications: specificationsPage,
    products: productsPage,
    inventory: inventoryPage,
    loadOptions: loadOptions,
    invalidateOptions: invalidateOptions,
  };

  global.ALW = global.ALW || {};
  global.ALW.pagesCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
