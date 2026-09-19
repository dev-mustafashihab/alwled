/**
 * alwled shop — صفحات المتجر العام (كل نداء API يمرّ من ALW.shop.api ⇒ ALW.api المركزي).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;

  var SORT_OPTIONS = [
    { value: 'createdAt:desc', label: 'الأحدث' },
    { value: 'price:asc', label: 'الأرخص أولًا' },
    { value: 'price:desc', label: 'الأغلى أولًا' },
    { value: 'name:asc', label: 'الاسم (أ–ي)' },
  ];

  function el(tag, options, children) {
    return shop.el(tag, options, children);
  }

  function sectionHead(title, subtitle, action) {
    return el('div', { class: 'shop-section__head' }, [
      el('div', {}, [
        el('h2', { class: 'shop-section__title', text: title }),
        subtitle ? el('p', { class: 'shop-section__sub', text: subtitle }) : null,
      ]),
      action || null,
    ]);
  }

  function crumbs(items) {
    var nodes = [];
    items.forEach(function (item, index) {
      if (index) nodes.push(el('span', { text: '‹', attrs: { 'aria-hidden': 'true' } }));
      nodes.push(item.href ? el('a', { href: item.href, text: item.label }) : el('span', { text: item.label }));
    });
    return el('nav', { class: 'shop-crumbs', attrs: { 'aria-label': 'مسار التنقل' } }, nodes);
  }

  function errorBlock(error, retry) {
    var message = (error && error.message) || 'تعذّر تحميل البيانات.';
    return shop.stateBlock('error', 'تعذّر تحميل البيانات', message, [
      el('button', { class: 'btn btn--primary', type: 'button', text: 'إعادة المحاولة', onclick: retry }),
    ]);
  }

  function viewAllLink(hash, label) {
    return el('a', { class: 'shop-section__link', href: hash, text: label || 'عرض الكل ‹' });
  }

  function grid(products) {
    return el('div', { class: 'shop-grid' }, products.map(function (product) {
      return shop.productCard(product);
    }));
  }

  /* ------------------------------------------------------------------ HOME */
  function home(view) {
    shop.clear(view);
    view.appendChild(shop.loadingBlock('جارٍ تحميل المنتجات من المتجر…'));

    return Promise.all([
      shop.api.products({ limit: 24, sortBy: 'createdAt', sortOrder: 'desc' }),
      shop.api.products({ isFeatured: true, limit: 8 }).catch(function () { return { items: [] }; }),
      shop.api.categories().catch(function () { return { items: [] }; }),
      shop.api.brands().catch(function () { return { items: [] }; }),
    ]).then(function (results) {
      var products = results[0] || {};
      var featured = (results[1] && results[1].items) || [];
      var categories = (results[2] && results[2].items) || [];
      var brands = (results[3] && results[3].items) || [];
      var items = products.items || [];
      var total = (products.meta && products.meta.total) || items.length;

      // العروض: تُحسب من بيانات المتجر الفعلية فقط (hasDiscount / discountPercentage)
      var offers = items.filter(function (p) { return p.hasDiscount === true; }).slice(0, 4);
      var latest = items.slice(0, 4);
      var isGuest = shop.visitorState() !== 'authenticated';

      shop.clear(view);

      /* 1 — شريط الأخبار (بيانات واجهة ثابتة — تُربط باللوحة لاحقاً) */
      view.appendChild(homeTicker([
        '🔥 عروض جديدة على الأجهزة المنزلية',
        '✨ تشكيلة جديدة وصلت المعرض',
        '🚚 خدمة التوصيل متوفرة',
        '⭐ تابع أحدث عروضنا',
      ]));

      /* 2 — Hero Slider (يستبدل الـHero الثابت) */
      view.appendChild(homeSlider([
        {
          title: 'كل احتياجات منزلك في مكان واحد',
          text: 'اكتشف تشكيلة متنوعة من الأجهزة المنزلية',
          cta: { label: 'تصفح المنتجات', anchor: 'shop-home-categories' },
        },
        {
          title: 'عروض مميزة',
          text: 'اكتشف أحدث العروض المتوفرة في المعرض',
          cta: { label: 'شاهد العروض', anchor: 'shop-home-offers' },
        },
        {
          title: 'وصل حديثًا',
          text: 'شاهد أحدث المنتجات التي وصلت إلى المعرض',
          cta: { label: 'اكتشف الجديد', anchor: 'shop-home-newest' },
        },
      ]));

      /* 3 — التصنيفات الرئيسية */

      if (categories.length) {
        view.appendChild(el('section', { class: 'shop-section shop-home-section', id: 'shop-home-categories' }, [
          sectionHead('تسوّق حسب التصنيف', 'اختر التصنيف للوصول مباشرة إلى منتجاته', viewAllLink('#/products?view=categories')),
          el('div', { class: 'shop-taxonomy' }, categories.slice(0, 8).map(function (category) {
            return el('a', {
              class: 'shop-taxonomy__item',
              href: shop.buildHash({ path: '/products', query: { categoryId: category.id } }),
            }, [
              el('span', { class: 'shop-taxonomy__icon', attrs: { 'aria-hidden': 'true' } },
                ALW.icons && ALW.icons.node ? [ALW.icons.node('layout-grid', 22)] : []),
              el('span', { class: 'shop-taxonomy__name', text: category.name }),
              typeof category.productsCount === 'number'
                ? el('span', { class: 'shop-taxonomy__count', text: category.productsCount + ' منتج' })
                : null,
            ]);
          })),
        ]));
      }

      /* 3 — العروض والخصومات (تظهر فقط إن وُجدت خصومات فعلية) */
      if (offers.length) {
        view.appendChild(el('section', { class: 'shop-section shop-section--offers shop-home-section', id: 'shop-home-offers' }, [
          sectionHead('العروض والخصومات', 'منتجات بأسعار مخفّضة كما هي مسجّلة في المتجر',
            viewAllLink('#/products?offers=1', 'كل العروض ‹')),
          grid(offers),
        ]));
      }

      /* 4 — منتجات مميزة (isFeatured من الـBackend) */
      if (featured.length) {
        view.appendChild(el('section', { class: 'shop-section shop-home-section', id: 'shop-home-featured' }, [
          sectionHead('منتجات مميزة', 'اختيار المتجر من الأجهزة', viewAllLink('#/products')),
          grid(featured.slice(0, 4)),
        ]));
      }

      /* 5 — أحدث المنتجات */
      view.appendChild(el('section', { class: 'shop-section shop-home-section', id: 'shop-home-newest' }, [
        sectionHead('أحدث المنتجات', 'آخر ما أُضيف إلى المتجر', viewAllLink('#/products')),
        latest.length ? grid(latest) : shop.stateBlock('empty', 'لا توجد منتجات حاليًا', 'سيتم عرض المنتجات هنا بمجرد إضافتها إلى المتجر.'),
      ]));

      /* 6 — العلامات التجارية */
      if (brands.length) {
        view.appendChild(el('section', { class: 'shop-section' }, [
          sectionHead('العلامات التجارية', 'تصفّح منتجات العلامة التي تثق بها', viewAllLink('#/products?view=brands')),
          el('div', { class: 'shop-chips' }, brands.slice(0, 12).map(function (brand) {
            return el('a', { class: 'chip', href: shop.buildHash({ path: '/products', query: { brandId: brand.id } }) }, [
              el('span', { text: brand.name }),
            ]);
          })),
        ]));
      }

      /* 7 — قسم الثقة (معلومات المتجر الفعلية فقط) */
      view.appendChild(el('section', { class: 'shop-section' }, [
        sectionHead('لماذا تتسوّق من متجرنا', 'معلومات المتجر الفعلية — بدون وعود غير موجودة في النظام'),
        el('div', { class: 'shop-benefits' }, [
          benefit('shopping-cart', 'تصفّح بلا تسجيل', 'اطّلع على المنتجات والأسعار مباشرة، والتسجيل مطلوب فقط عند الشراء.'),
          benefit('credit-card', 'الدفع عبر شام كاش', 'تحويل يدوي مع رفع الإيصال، ويُراجع من فريق المتجر قبل التثبيت.'),
          benefit('bell', 'حساب لمتابعة طلبك', 'إشعارات داخل حسابك بحالة الطلب والدفعة عند تسجيل الدخول.'),
          benefit('tag', 'أسعار المتجر مباشرة', 'الأسعار تُعرض كما هي في نظام المتجر بدون تعديل من الواجهة.'),
        ]),
      ]));

      // نطاق CSS للرئيسية فقط (بلا تغيير بنية DOM)
      Array.prototype.slice.call(view.children).forEach(function (node) {
        if (node.classList) node.classList.add('shop-home');
      });

      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(errorBlock(error, function () { home(view); }));
      return false;
    });
  }

  function benefit(icon, title, text) {
    return el('article', { class: 'shop-benefit' }, [
      el('span', { class: 'shop-benefit__icon', attrs: { 'aria-hidden': 'true' } },
        ALW.icons && ALW.icons.node ? [ALW.icons.node(icon, 22)] : []),
      el('div', {}, [
        el('h3', { class: 'shop-benefit__title', text: title }),
        el('p', { class: 'shop-benefit__text', text: text }),
      ]),
    ]);
  }

  /* ---------------------------------------------------------------- HOME-1: شريط الأخبار + Hero Slider */
  var homeSliderTimer = null; // مؤقّت واحد فقط — يُنظَّف قبل كل إنشاء جديد

  function homeTicker(messages) {
    var list = (messages || []).filter(Boolean);
    if (!list.length) return null;
    var track = el('div', { class: 'shop-home-ticker__track' });
    list.forEach(function (msg, i) {
      if (i) track.appendChild(el('span', { class: 'shop-home-ticker__sep', text: '•', attrs: { 'aria-hidden': 'true' } }));
      track.appendChild(el('span', { class: 'shop-home-ticker__item', text: msg }));
    });
    // نسخة مكرّرة للّف السلس (مخفية عن قارئ الشاشة)
    var clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    Array.prototype.slice.call(clone.children).forEach(function (child) { track.appendChild(child); });

    return el('div', {
      class: 'shop-home-ticker', id: 'shop-home-ticker',
      attrs: { role: 'region', 'aria-label': 'أخبار وإعلانات المتجر' },
    }, [
      el('span', { class: 'shop-home-ticker__label', text: '📢', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'shop-home-ticker__viewport' }, [track]),
      el('span', { class: 'visually-hidden', text: list.join(' — ') }),
    ]);
  }

  function scrollToHomeAnchor(id) {
    var target = (global.document || document).getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function homeSlider(slides) {
    var list = (slides || []).filter(function (s) { return s && s.title; });
    if (!list.length) return null;

    var index = 0;
    var paused = false;
    var track = el('div', { class: 'shop-home-slider__track' });
    var dots = el('div', { class: 'shop-home-slider__dots', attrs: { role: 'tablist', 'aria-label': 'شرائح العرض' } });

    list.forEach(function (slide, i) {
      var ctaId = 'shop-home-slide-cta-' + i;
      track.appendChild(el('article', {
        class: 'shop-home-slide shop-home-slide--' + ((i % 3) + 1),
        dataset: { index: String(i) },
        attrs: { role: 'group', 'aria-roledescription': 'شريحة', 'aria-label': (i + 1) + ' من ' + list.length },
      }, [
        el('div', { class: 'shop-home-slide__shapes', attrs: { 'aria-hidden': 'true' } }),
        el('div', { class: 'shop-home-slide__body' }, [
          el('h2', { class: 'shop-home-slide__title', text: slide.title }),
          slide.text ? el('p', { class: 'shop-home-slide__text', text: slide.text }) : null,
          slide.cta
            ? el('button', {
                class: 'btn btn--lg shop-home-slide__cta',
                id: ctaId,
                type: 'button',
                text: slide.cta.label,
                attrs: { 'aria-label': slide.cta.label + ' — ' + slide.title },
              })
            : null,
        ]),
      ]));
      dots.appendChild(el('button', {
        class: 'shop-home-slider__dot', type: 'button',
        attrs: { role: 'tab', 'aria-label': 'الشريحة ' + (i + 1), 'aria-selected': 'false' },
      }));
    });

    var root = el('section', {
      class: 'shop-home-slider', id: 'shop-home-slider',
      attrs: { 'aria-label': 'أبرز العروض', 'aria-roledescription': 'عرض شرائح' },
    }, [
      el('div', { class: 'shop-home-slider__viewport' }, [track]),
      list.length > 1 ? el('button', { class: 'shop-home-slider__arrow shop-home-slider__arrow--prev', type: 'button', attrs: { 'aria-label': 'الشريحة السابقة' } }, [el('span', { attrs: { 'aria-hidden': 'true' }, html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>' })]) : null,
      list.length > 1 ? el('button', { class: 'shop-home-slider__arrow shop-home-slider__arrow--next', type: 'button', attrs: { 'aria-label': 'الشريحة التالية' } }, [el('span', { attrs: { 'aria-hidden': 'true' }, html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>' })]) : null,
      list.length > 1 ? dots : null,
    ]);

    function render(i) {
      index = (i + list.length) % list.length;
      track.style.transform = 'translateX(' + (index * 100) + '%)';
      Array.prototype.slice.call(track.children).forEach(function (node, k) {
        node.setAttribute('aria-hidden', k === index ? 'false' : 'true');
      });
      Array.prototype.slice.call(dots.children).forEach(function (dot, k) {
        dot.classList.toggle('is-active', k === index);
        dot.setAttribute('aria-selected', k === index ? 'true' : 'false');
      });
    }

    function stop() {
      if (homeSliderTimer) { global.clearInterval(homeSliderTimer); homeSliderTimer = null; }
    }
    function start() {
      stop();
      if (list.length < 2) return;
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      homeSliderTimer = global.setInterval(function () {
        // إيقاف ذاتي إن أُزيل السلايدر من الصفحة (تنقّل/إعادة رسم)
        if (!(global.document || document).body.contains(root)) { stop(); return; }
        if (!paused) render(index + 1);
      }, 5500);
    }

    // CTAs: تمرير إلى أقسام موجودة في الصفحة (بلا مسارات جديدة)
    list.forEach(function (slide, i) {
      var btn = root.querySelector('#shop-home-slide-cta-' + i);
      if (btn && slide.cta && slide.cta.anchor) {
        btn.addEventListener('click', function () { scrollToHomeAnchor(slide.cta.anchor); });
      }
    });

    if (list.length > 1) {
      var prev = root.querySelector('.shop-home-slider__arrow--prev');
      var next = root.querySelector('.shop-home-slider__arrow--next');
      if (prev) prev.addEventListener('click', function () { render(index - 1); });
      if (next) next.addEventListener('click', function () { render(index + 1); });
      Array.prototype.slice.call(dots.children).forEach(function (dot, i) {
        dot.addEventListener('click', function () { render(i); });
      });

      // Swipe على الجوال
      var startX = null;
      root.addEventListener('touchstart', function (event) { startX = event.touches[0].clientX; paused = true; }, { passive: true });
      root.addEventListener('touchend', function (event) {
        if (startX === null) return;
        var dx = event.changedTouches[0].clientX - startX;
        startX = null;
        paused = false;
        if (Math.abs(dx) > 40) render(dx < 0 ? index + 1 : index - 1); // RTL
      });

      // إيقاف مؤقت عند التفاعل بالماوس
      root.addEventListener('mouseenter', function () { paused = true; });
      root.addEventListener('mouseleave', function () { paused = false; });
      start();
    }

    render(0);
    return root;
  }

  /* ----------------------------------------- إتاحة لوحة الفلاتر (المرحلة 3G)
     وحدة واحدة لكل سلوك الـmodal على الجوال: حالة aria · قفل التمرير · التركيز
     الابتدائي · حبس التركيز · Escape · إرجاع التركيز. لا منطق أعمال هنا. */
  var filterA11y = (function () {
    var locked = false;
    var prevHtml = '';
    var prevBody = '';
    var pendingFocus = false;

    function wrap() { return document.getElementById('shop-filters'); }
    function sheet() { return document.querySelector('.shop-filters__sheet'); }
    function toggleBtn() { return document.getElementById('shop-filters-toggle'); }
    function isMobile() { return window.innerWidth <= 768; }
    function isOpen() { var node = wrap(); return !!node && node.classList.contains('is-open'); }

    function focusables() {
      var node = sheet();
      if (!node) return [];
      return Array.prototype.filter.call(
        node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (item) { var box = item.getBoundingClientRect(); return box.width > 0 && box.height > 0; }
      );
    }

    function lock(on) {
      var root = document.documentElement;
      if (on) {
        if (locked) return;
        prevHtml = root.style.overflow;
        prevBody = document.body.style.overflow;
        root.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        locked = true;
      } else {
        if (!locked) return;
        root.style.overflow = prevHtml || '';
        document.body.style.overflow = prevBody || '';
        locked = false;
      }
    }

    function applyModal(on) {
      var node = sheet();
      if (!node) return;
      if (on && isMobile()) {
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        node.setAttribute('aria-labelledby', 'shop-filters-title');
      } else {
        node.removeAttribute('role');
        node.removeAttribute('aria-modal');
        node.removeAttribute('aria-labelledby');
      }
    }

    function closeOthers() {
      var drawer = document.querySelector('.shop-drawer.is-open');
      if (drawer) {
        drawer.classList.remove('is-open');
        var panel = drawer.querySelector('.shop-drawer__panel');
        if (panel) panel.classList.remove('is-open');
      }
      var searchSheet = document.querySelector('.shop-search-sheet.is-open');
      if (searchSheet) searchSheet.classList.remove('is-open');
    }

    function bar() { return document.getElementById('shop-toolbar'); }

    function set(open, restoreFocus) {
      var node = wrap();
      var btn = toggleBtn();
      if (!node) return;
      if (open) {
        closeOthers();
        node.classList.add('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (bar()) bar().classList.add('is-filters-open');
        if (isMobile()) {
          lock(true);
          applyModal(true);
          // التركيز الابتدائي بعد أن تصبح اللوحة مرئية (انتقال visibility) — وإلا يفشل التركيز
          var focusFirst = function () {
            var nodes = focusables();
            if (nodes.length && nodes[0].focus) nodes[0].focus();
          };
          setTimeout(focusFirst, 60);
        }
      } else {
        node.classList.remove('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (bar()) bar().classList.remove('is-filters-open');
        lock(false);
        applyModal(false);
        if (restoreFocus && btn && btn.focus && btn.getBoundingClientRect().height > 0) btn.focus();
      }
    }

    function onKeydown(event) {
      if (!isOpen() || !isMobile()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        set(false, true);
        return;
      }
      if (event.key !== 'Tab') return;
      var nodes = focusables();
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      var active = document.activeElement;
      var node = sheet();
      var inside = !!(node && active && node.contains(active));
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        if (last.focus) last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        if (first.focus) first.focus();
      }
    }

    function onResize() {
      if (!isOpen()) return;
      if (!isMobile()) set(false, false);   // جوال ← ديسكتوب: إزالة حالة المودال بلا سحب التركيز
      else applyModal(true);
    }

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (target.closest('#shop-search-btn') || target.closest('#shop-burger')) set(false, false);
    }, true);
    window.addEventListener('resize', onResize);

    return {
      set: set,
      isOpen: isOpen,
      markPending: function () { pendingFocus = true; },
      afterRender: function () {
        if (isOpen()) applyModal(true);
        else { lock(false); applyModal(false); }
        if (pendingFocus) {
          pendingFocus = false;
          var btn = toggleBtn();
          if (btn && btn.focus && btn.getBoundingClientRect().height > 0) btn.focus();
        }
      },
    };
  })();

  /* ------------------------------------------------------------------ PRODUCTS */
  function products(view, ctx) {
    var query = ctx.query || {};
    if (query.view === 'categories') return taxonomy(view, 'categories');
    if (query.view === 'brands') return taxonomy(view, 'brands');

    var filters = shop.pickQuery(query, ALW.shop.ALLOWED_PRODUCT_PARAMS);
    var state = { filters: filters, categories: [], brands: [] };

    shop.clear(view);
    view.appendChild(shop.loadingBlock('جارٍ تحميل المنتجات…'));

    return Promise.all([
      shop.api.products(Object.assign({}, filters, { includeInventory: true })),
      shop.api.categories().catch(function () { return { items: [] }; }),
      shop.api.brands().catch(function () { return { items: [] }; }),
    ]).then(function (results) {
      var payload = results[0] || {};
      state.categories = (results[1] && results[1].items) || [];
      state.brands = (results[2] && results[2].items) || [];
      renderProducts(view, state, payload);
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'المنتجات' }]));
      view.appendChild(errorBlock(error, function () { products(view, ctx); }));
      return false;
    });
  }

  function renderProducts(view, state, payload) {
    var items = payload.items || [];
    var meta = payload.meta || {};
    var filters = state.filters;
    var page = parseInt(meta.page, 10) || 1;
    var totalPages = parseInt(meta.totalPages, 10) || 1;
    // فلترة الخصم على ما يعرضه الـAPI فعلاً (لا يفترض بيانات غير موجودة)
    // (PHASE 3 · STEP 3G.1) أُزيلت فلترة inStock المحلية مع إخفاء التحكّم: لا فلترة مخزون
    // وهمية ولا ادعاء وظيفة. ?inStock=1 يُقرأ من الرابط ويُتجاهَل بأمان (بلا كسر ولا تغيير نتائج).
    var hasLocalFilters = filters.offers === '1';
    if (filters.offers === '1') items = items.filter(function (p) { return p.hasDiscount === true; });
    var shownTotal = hasLocalFilters ? items.length : (meta.total || items.length);

    // PHASE 3 · STEP 3C — صفحة خارج النطاق (مثلاً بعد تضييق النتائج): نعود للصفحة 1
    // بدل عرض حالة فارغة مع عدّاد يناقضها. لا يتدخّل عند الفراغ الحقيقي (total = 0).
    if (!items.length && !hasLocalFilters && (meta.total || 0) > 0 && page > totalPages) {
      var back = {};
      Object.keys(filters).forEach(function (key) {
        if (key !== 'page' && filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) back[key] = filters[key];
      });
      global.location.hash = shop.buildHash({ path: '/products', query: back });
      return;
    }

    shop.clear(view);
    view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'المنتجات' }]));

    var searchControl = el('input', {
      class: 'input',
      type: 'search',
      value: filters.search || '',
      placeholder: 'ابحث بالاسم أو الوصف…',
      attrs: { 'aria-label': 'بحث في المنتجات', id: 'shop-filter-search' },
    });

    var categorySelect = el('select', { class: 'select', attrs: { 'aria-label': 'تصفية حسب التصنيف', id: 'shop-filter-category' } },
      [el('option', { value: '', text: 'كل التصنيفات' })].concat(state.categories.map(function (category) {
        return el('option', { value: category.id, text: category.name, selected: String(filters.categoryId || '') === String(category.id) ? 'selected' : null });
      })));

    var brandSelect = el('select', { class: 'select', attrs: { 'aria-label': 'تصفية حسب العلامة', id: 'shop-filter-brand' } },
      [el('option', { value: '', text: 'كل العلامات' })].concat(state.brands.map(function (brand) {
        return el('option', { value: brand.id, text: brand.name, selected: String(filters.brandId || '') === String(brand.id) ? 'selected' : null });
      })));

    var currentSort = (filters.sortBy || 'createdAt') + ':' + (filters.sortOrder || 'desc');
    var sortSelect = el('select', { class: 'select', attrs: { 'aria-label': 'ترتيب النتائج', id: 'shop-filter-sort' } },
      SORT_OPTIONS.map(function (option) {
        return el('option', { value: option.value, text: option.label, selected: currentSort === option.value ? 'selected' : null });
      }));

    function apply(next) {
      var merged = Object.assign({}, filters, next);
      // PHASE 3 · STEP 3C — تغيير فلتر يُعيد الصفحة إلى 1 (الافتراضي) بلا ضجيج page=1 في الـhash
      if (next && next.page === undefined && !next.keepPage) delete merged.page;
      if (String(merged.page) === '1') delete merged.page;
      var clean = {};
      Object.keys(merged).forEach(function (key) {
        if (merged[key] !== '' && merged[key] !== null && merged[key] !== undefined) clean[key] = merged[key];
      });
      global.location.hash = shop.buildHash({ path: '/products', query: clean });
    }

    var toolbar = el('div', { class: 'shop-toolbar', id: 'shop-toolbar', attrs: { role: 'search' } }, [
      el('div', { class: 'shop-toolbar__field' }, [
        el('label', { class: 'shop-toolbar__label', for: 'shop-filter-search', text: 'بحث' }),
        searchControl,
      ]),
      el('div', { class: 'shop-toolbar__field shop-toolbar__field--filter' }, [
        el('label', { class: 'shop-toolbar__label', for: 'shop-filter-category', text: 'التصنيف' }),
        categorySelect,
      ]),
      el('div', { class: 'shop-toolbar__field shop-toolbar__field--filter' }, [
        el('label', { class: 'shop-toolbar__label', for: 'shop-filter-brand', text: 'العلامة' }),
        brandSelect,
      ]),
      el('div', { class: 'shop-toolbar__field shop-toolbar__field--filter' }, [
        el('label', { class: 'shop-toolbar__label', for: 'shop-filter-sort', text: 'الترتيب' }),
        sortSelect,
      ]),
      el('div', { class: 'shop-toolbar__field shop-toolbar__field--filter' }, [
        el('span', { class: 'shop-toolbar__label', text: 'السعر' }),
        el('div', { class: 'shop-price-range' }, [
          el('input', {
            class: 'input', type: 'number', value: filters.minPrice || '', placeholder: 'من', min: '0', step: '1',
            attrs: { 'aria-label': 'أقل سعر', id: 'shop-filter-minprice', inputmode: 'numeric' },
          }),
          el('span', { class: 'shop-price-range__sep', text: '—', attrs: { 'aria-hidden': 'true' } }),
          el('input', {
            class: 'input', type: 'number', value: filters.maxPrice || '', placeholder: 'إلى', min: '0', step: '1',
            attrs: { 'aria-label': 'أعلى سعر', id: 'shop-filter-maxprice', inputmode: 'numeric' },
          }),
        ]),
      ]),
      /* (PHASE 3 · STEP 3G.1) حقل «التوفر» أُزيل من العرض نهائيًا:
         واجهة قائمة المنتجات للزائر لا تدعم inStock server-side ⇒ لا يُعرض تحكّم غير فعّال.
         التوافق: قراءة ?inStock=1 من الرابط باقية (بلا فلترة محلية وبلا كسر). */
      el('div', { class: 'shop-toolbar__field shop-toolbar__field--filter' }, [
        el('span', { class: 'shop-toolbar__label', text: 'عروض' }),
        el('label', { class: 'shop-check', for: 'shop-filter-offers' }, [
          el('input', {
            type: 'checkbox', checked: filters.offers === '1' ? 'checked' : null,
            attrs: { id: 'shop-filter-offers' },
          }),
          el('span', { text: 'عليها خصم فقط' }),
        ]),
      ]),
      el('div', {
        class: 'shop-toolbar__count', text: shownTotal + ' منتج',
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      }),
    ]);

    // جوال: زر يطوي الفلاتر (البحث يبقى ظاهراً) — العرض على الديسكتوب كما هو
    var filtersOpen = false; // الجوال: لوحة سفلية تُفتح بالزر · الديسكتوب: الفلاتر ظاهرة دائماً
    var filtersToggle = el('button', {
      class: 'shop-filters__toggle', type: 'button', id: 'shop-filters-toggle',
      attrs: { 'aria-expanded': filtersOpen ? 'true' : 'false', 'aria-controls': 'shop-toolbar', 'aria-haspopup': 'dialog' },
    }, [
      el('span', { text: 'الفلاتر والترتيب' }),
      el('span', { class: 'shop-filters__chevron', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>' }),
    ]);
    var filtersWrap = el('div', { class: 'shop-filters', id: 'shop-filters' }, []);
    filtersToggle.setAttribute('aria-expanded', 'false');
    filtersToggle.addEventListener('click', function () {
      filterA11y.set(!filterA11y.isOpen(), false);
    });
    filtersWrap.appendChild(filtersToggle);

    searchControl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply({ search: searchControl.value.trim() });
      }
    });
    searchControl.addEventListener('change', function () {
      apply({ search: searchControl.value.trim() });
    });
    categorySelect.addEventListener('change', function () {
      apply({ categoryId: categorySelect.value });
    });
    brandSelect.addEventListener('change', function () {
      apply({ brandId: brandSelect.value });
    });
    sortSelect.addEventListener('change', function () {
      var parts = String(sortSelect.value).split(':');
      apply({ sortBy: parts[0], sortOrder: parts[1] });
    });
    var minPriceInput = toolbar.querySelector('#shop-filter-minprice');
    var maxPriceInput = toolbar.querySelector('#shop-filter-maxprice');
    // (3G.1) لا حقل inStock: أُزيل مع تحكّمه — لا عنصر مخفي قابل للتركيز
    var offersBox = toolbar.querySelector('#shop-filter-offers');
    function applyPrice() {
      apply({
        minPrice: minPriceInput && minPriceInput.value !== '' ? minPriceInput.value : '',
        maxPrice: maxPriceInput && maxPriceInput.value !== '' ? maxPriceInput.value : '',
      });
    }
    if (minPriceInput) minPriceInput.addEventListener('change', applyPrice);
    if (maxPriceInput) maxPriceInput.addEventListener('change', applyPrice);
    if (offersBox) offersBox.addEventListener('change', function () { apply({ offers: offersBox.checked ? '1' : '' }); });

    // زر «تم» لإغلاق لوحة الفلاتر على الجوال
    var sheetDone = el('button', {
      class: 'btn btn--primary shop-filters__done', type: 'button', text: 'عرض النتائج',
      onclick: function () { filterA11y.set(false, true); },
    });
    var sheetClear = el('button', {
      class: 'btn btn--ghost shop-filters__clear', type: 'button', text: 'تفريغ الفلاتر',
      onclick: function () { filterA11y.markPending(); global.location.hash = shop.buildHash({ path: '/products' }); },
    });
    var scrim = el('div', {
      class: 'shop-filters__scrim', attrs: { 'aria-hidden': 'true' },
      onclick: function () { filterA11y.set(false, true); },
    });

    view.appendChild(el('div', { class: 'shop-section__head' }, [
      el('div', {}, [
        el('h1', { class: 'shop-section__title', text: 'كل المنتجات' }),
        el('p', { class: 'shop-section__sub', text: 'تصفّح، ابحث، وفلتر — كل البيانات من المتجر مباشرة.' }),
      ]),
      filters.search || filters.categoryId || filters.brandId || filters.minPrice || filters.maxPrice || filters.inStock === '1' || filters.offers === '1'
        ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'تفريغ الفلاتر', onclick: function () { global.location.hash = shop.buildHash({ path: '/products' }); } })
        : null,
    ]));
    filtersWrap.appendChild(scrim);
    filtersWrap.appendChild(el('div', { class: 'shop-filters__sheet' }, [
      el('div', { class: 'shop-filters__sheet-head' }, [
        el('strong', { text: 'الفلاتر والترتيب', attrs: { id: 'shop-filters-title' } }),
        el('button', {
          class: 'shop-iconbtn shop-filters__sheet-close', type: 'button', text: '✕',
          attrs: { 'aria-label': 'إغلاق الفلاتر' },
          onclick: function () { filterA11y.set(false, true); },
        }),
      ]),
      toolbar,
      el('div', { class: 'shop-filters__sheet-foot' }, [sheetClear, sheetDone]),
    ]));
    view.appendChild(filtersWrap);

    if (!items.length) {
      view.appendChild(shop.stateBlock(
        'empty',
        'لا توجد منتجات مطابقة',
        filters.search || filters.categoryId || filters.brandId
          ? 'جرّب تعديل البحث أو إزالة الفلاتر.'
          : 'لا توجد منتجات معروضة حاليًا في المتجر.'
      ));
      return;
    }

    view.appendChild(grid(items));

    if (totalPages > 1) {
      var prev = el('button', {
        class: 'pagination__btn', type: 'button', text: 'السابق',
        disabled: page <= 1 ? 'disabled' : null,
        onclick: function () { apply({ page: Math.max(1, page - 1), keepPage: true }); },
      });
      var next = el('button', {
        class: 'pagination__btn', type: 'button', text: 'التالي',
        disabled: page >= totalPages ? 'disabled' : null,
        onclick: function () { apply({ page: Math.min(totalPages, page + 1), keepPage: true }); },
      });
      view.appendChild(el('div', { class: 'pagination' }, [
        prev,
        el('span', { class: 'pagination__info', text: 'صفحة ' + page + ' من ' + totalPages }),
        next,
      ]));
    }

    // بعد كل إعادة رسم: تزامن حالة لوحة الفلاتر (منع قفل تمرير عالق) وإرجاع التركيز إن لزم
    setTimeout(filterA11y.afterRender, 0);
  }

  /* ------------------------------------------------------------------ TAXONOMY (categories / brands) */
  function taxonomy(view, kind) {
    var isCategories = kind === 'categories';
    shop.clear(view);
    view.appendChild(shop.loadingBlock(isCategories ? 'جارٍ تحميل التصنيفات…' : 'جارٍ تحميل العلامات…'));

    var loader = isCategories ? shop.api.categories : shop.api.brands;
    return loader().then(function (payload) {
      var items = (payload && payload.items) || [];
      shop.clear(view);
      view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: isCategories ? 'التصنيفات' : 'العلامات' }]));
      view.appendChild(el('div', { class: 'shop-section__head' }, [
        el('div', {}, [
          el('h1', { class: 'shop-section__title', text: isCategories ? 'تصفّح حسب التصنيف' : 'تصفّح حسب العلامة التجارية' }),
          el('p', { class: 'shop-section__sub', text: 'اختر عنصرًا لعرض منتجاته.' }),
        ]),
      ]));
      if (!items.length) {
        view.appendChild(shop.stateBlock('empty', isCategories ? 'لا توجد تصنيفات حاليًا' : 'لا توجد علامات حاليًا', 'ستظهر هنا بمجرد إضافتها في المتجر.'));
        return false;
      }
      view.appendChild(el('div', { class: 'shop-taxonomy' }, items.map(function (item) {
        var query = isCategories ? { categoryId: item.id } : { brandId: item.id };
        return el('a', { class: 'shop-taxonomy__item', href: shop.buildHash({ path: '/products', query: query }) }, [
          el('div', {}, [
            el('span', { class: 'shop-taxonomy__name', text: item.name }),
            item.description ? el('div', { class: 'shop-note', text: item.description }) : null,
          ]),
          typeof item.productsCount === 'number' ? el('span', { class: 'shop-taxonomy__count', text: item.productsCount + ' منتج' }) : null,
        ]);
      })));
      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(errorBlock(error, function () { taxonomy(view, kind); }));
      return false;
    });
  }

  /* ------------------------------------------------------------------ PRODUCT DETAILS */
  function product(view, ctx) {
    var id = ctx.params && ctx.params[0];
    shop.clear(view);
    view.appendChild(shop.loadingBlock('جارٍ تحميل تفاصيل المنتج…'));

    return shop.api.product(id).then(function (payload) {
      var item = payload || {};
      shop.clear(view);

      view.appendChild(crumbs([
        { label: 'الرئيسية', href: '#/' },
        { label: 'المنتجات', href: '#/products' },
        item.category ? { label: item.category.name, href: shop.buildHash({ path: '/products', query: { categoryId: item.category.id } }) } : null,
        { label: item.name },
      ].filter(Boolean)));

      var model = shop.productCardModel(item);
      var images = (item.images || []).map(function (image) {
        return typeof image === 'string' ? image : (image && (image.url || image.path));
      }).filter(Boolean);
      if (!images.length && model.image) images.push(model.image);

      var stage = el('div', { class: 'shop-gallery__stage' }, [
        images.length ? shop.imageNode(images[0], model.name, '', false) : null,
      ]);
      if (!images.length) stage.appendChild(el('div', { class: 'shop-card__placeholder', html: productIconSvg() }));

      var thumbs = images.length > 1
        ? el('div', { class: 'shop-gallery__thumbs' }, images.map(function (source, index) {
          return el('button', {
            class: 'shop-gallery__thumb', type: 'button',
            attrs: { 'aria-pressed': index === 0 ? 'true' : 'false', 'aria-label': 'صورة ' + (index + 1) },
            onclick: function (event) {
              var button = event.currentTarget;
              var img = stage.querySelector('img');
              if (img) img.src = source;
              Array.prototype.forEach.call(thumbs.querySelectorAll('button'), function (node) {
                node.setAttribute('aria-pressed', node === button ? 'true' : 'false');
              });
            },
          }, [shop.imageNode(source, model.name + ' — صورة ' + (index + 1), '', true)]);
        }))
        : null;

      var gallery = el('div', { class: 'shop-gallery' }, [stage, thumbs]);

      var qty = el('input', {
        class: 'input shop-qty__input', type: 'number', value: '1',
        attrs: { min: '1', max: '99', 'aria-label': 'الكمية', id: 'shop-qty' },
      });
      var qtyBox = el('div', { class: 'shop-qty', attrs: { role: 'group', 'aria-label': 'اختيار الكمية' } }, [
        el('button', {
          class: 'shop-qty__btn', type: 'button', text: '−', attrs: { 'aria-label': 'إنقاص الكمية' },
          onclick: function () { qty.value = String(Math.max(1, (parseInt(qty.value, 10) || 1) - 1)); },
        }),
        qty,
        el('button', {
          class: 'shop-qty__btn', type: 'button', text: '+', attrs: { 'aria-label': 'زيادة الكمية' },
          onclick: function () { qty.value = String(Math.min(99, (parseInt(qty.value, 10) || 1) + 1)); },
        }),
      ]);

      /* (PHASE 4 · STEP 4B.1) التوفّر الحقيقي من الـAPI:
         inStock === false ⇒ زر معطّل بنص صريح (بلا ادعاء توفّر ولا إضافة للسلة).
         inStock === true أو غير معرّف ⇒ السلوك الحالي كما هو بلا اختراع حالة. */
      var unavailable = model.inStock === false;
      var addButton = el('button', {
        class: 'btn btn--primary btn--lg', type: 'button',
        text: unavailable ? 'غير متوفر حاليًا' : 'أضف إلى السلة',
        attrs: {
          id: 'shop-add-to-cart', 'data-product-id': String(model.id),
          disabled: unavailable ? 'disabled' : null,
        },
        onclick: function () {
          if (unavailable) return;
          ALW.shopAddToCart(addButton, model, qty);
        },
      });

      var buy = el('div', { class: 'shop-buy' }, [
        el('div', { class: 'shop-card__meta' }, [
          model.brand ? el('span', { text: model.brand }) : null,
          model.category ? el('span', { text: model.category }) : null,
          model.sku ? el('span', { text: 'رمز المنتج: ' + model.sku }) : null,
        ]),
        el('h1', { class: 'shop-buy__title', text: model.name }),
        el('div', { class: 'shop-buy__price' }, [
          el('span', { class: 'shop-price__now', text: shop.money(model.price) }),
          model.compareAtPrice ? el('span', { class: 'shop-price__was', text: shop.money(model.compareAtPrice) }) : null,
          model.hasDiscount && model.discountPercentage ? el('span', { class: 'shop-price__off', text: 'خصم ' + model.discountPercentage + '%' }) : null,
        ]),
        el('div', { class: 'shop-buy__facts' }, [
          fact('التوفّر', item.inStock === false ? 'غير متوفر حاليًا' : 'متوفر'),
          fact('العلامة', model.brand || '—'),
          fact('التصنيف', model.category || '—'),
          fact('رمز المنتج', model.sku || '—'),
        ]),
        el('div', { class: 'shop-buy__actions' }, [qtyBox, addButton]),
        /* (PHASE 4 · STEP 4B.1) أُزيل نص وعد الدفع («شام كاش…») لأن قواعد الدفع غير محسومة
           في PRODUCT.md — لا بديل مُختلق ولا وعد شحن/توصيل/ضمان. الحاوية أُزيلت كاملة (بلا فراغ). */
      ]);

      view.appendChild(el('div', { class: 'shop-product' }, [gallery, buy]));

      if (item.description) {
        view.appendChild(el('section', { class: 'shop-panel' }, [
          el('h2', { class: 'shop-panel__title', text: 'وصف المنتج' }),
          el('div', { class: 'shop-prose', text: item.description }),
        ]));
      }

      var specs = item.specifications || [];
      if (specs.length) {
        view.appendChild(el('section', { class: 'shop-panel' }, [
          el('h2', { class: 'shop-panel__title', text: 'المواصفات' }),
          el('div', { class: 'shop-specs' }, specs.map(function (spec) {
            var label = spec.name || (spec.definition && spec.definition.name) || spec.key || 'مواصفة';
            var value = spec.value === null || spec.value === undefined ? '—' : String(spec.value);
            var unit = spec.unit || (spec.definition && spec.definition.unit) || '';
            return fact(label, value + (unit ? ' ' + unit : ''));
          })),
        ]));
      }

      /* منتجات مشابهة — من نفس تصنيف المنتج (بيانات المتجر الحقيقية فقط) */
      var relatedCategoryId = item.category && item.category.id;
      if (relatedCategoryId) {
        shop.api.products({ categoryId: relatedCategoryId, limit: 8, includeInventory: true }).then(function (payload) {
          var related = ((payload && payload.items) || []).filter(function (p) {
            return Number(p.id) !== Number(item.id);
          }).slice(0, 4);
          if (!related.length) return;
          view.appendChild(el('section', { class: 'shop-section' }, [
            sectionHead('منتجات مشابهة', 'من نفس التصنيف في المتجر',
              viewAllLink(shop.buildHash({ path: '/products', query: { categoryId: relatedCategoryId } }))),
            grid(related),
          ]));
        }).catch(function () { /* قسم اختياري — لا يُعطّل الصفحة */ });
      }

      return true;
    }).catch(function (error) {
      shop.clear(view);
      view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'المنتجات', href: '#/products' }, { label: 'المنتج' }]));
      if (error && error.status === 404) {
        view.appendChild(shop.stateBlock('empty', 'المنتج غير موجود', 'قد يكون المنتج غير متاح أو تم حذفه من المتجر.', [
          el('a', { class: 'btn btn--primary', href: '#/products', text: 'تصفّح المنتجات' }),
        ]));
      } else {
        view.appendChild(errorBlock(error, function () { product(view, ctx); }));
      }
      return false;
    });
  }

  function fact(label, value) {
    return el('div', { class: 'shop-fact' }, [
      el('span', { class: 'shop-fact__label', text: label }),
      el('span', { class: 'shop-fact__value', text: value }),
    ]);
  }

  function productIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="lucide lucide-package"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/></svg>';
  }

  /* ------------------------------------------------------------------ AUTH */
  function field(label, control, hint) {
    return el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: control.id }, [
        el('span', { text: label }),
      ]),
      control,
      hint ? el('div', { class: 'field__hint', text: hint }) : null,
    ]);
  }

  function errorBox() {
    return el('div', { class: 'alert alert--danger', attrs: { role: 'alert', hidden: 'hidden' } }, [
      el('div', { class: 'alert__icon', text: '⚠️' }),
      el('div', {}, [el('span', { class: 'shop-auth__error-text' })]),
    ]);
  }

  function showError(box, message) {
    box.hidden = false;
    var target = box.querySelector('.shop-auth__error-text');
    if (target) target.textContent = message;
  }

  function loginPage(view, ctx) {
    var next = (ctx.query && ctx.query.next) || '/';
    shop.clear(view);
    view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'تسجيل الدخول' }]));

    if (shop.visitorState() === 'authenticated') {
      view.appendChild(el('section', { class: 'shop-auth' }, [
        el('h1', { class: 'shop-auth__title', text: 'أنت مسجّل الدخول بالفعل' }),
        el('p', { class: 'shop-auth__sub', text: 'يمكنك متابعة التصفح أو الخروج من الحساب.' }),
        el('div', { class: 'shop-auth__form' }, [
          el('a', { class: 'btn btn--primary btn--block', href: '#/products', text: 'تصفّح المنتجات' }),
          el('button', { class: 'btn btn--secondary btn--block', type: 'button', text: 'خروج', onclick: function () { ALW.app.logout(); } }),
        ]),
      ]));
      return Promise.resolve(true);
    }

    var phone = el('input', { class: 'input', id: 'shop-login-phone', name: 'phone', type: 'tel', inputmode: 'tel', required: 'required', autocomplete: 'username', placeholder: '09xxxxxxxx' });
    var password = el('input', { class: 'input', id: 'shop-login-password', name: 'password', type: 'password', required: 'required', autocomplete: 'current-password' });
    var toggle = el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button', text: 'إظهار',
      attrs: { 'aria-pressed': 'false', 'aria-label': 'إظهار كلمة المرور' },
      onclick: function () {
        var shown = password.type === 'text';
        password.type = shown ? 'password' : 'text';
        toggle.textContent = shown ? 'إظهار' : 'إخفاء';
        toggle.setAttribute('aria-pressed', shown ? 'false' : 'true');
      },
    });
    var box = errorBox();
    var submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', text: 'تسجيل الدخول' });

    var form = el('form', { class: 'shop-auth__form', attrs: { novalidate: 'novalidate', 'aria-describedby': 'shop-login-error' } }, [
      box,
      field('رقم الهاتف', phone),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'shop-login-password' }, [el('span', { text: 'كلمة المرور' })]),
        el('div', { class: 'input-group' }, [password, el('div', { class: 'input-group__action' }, [toggle])]),
      ]),
      el('p', { class: 'shop-note', text: 'رسالة الخطأ عامة لأسباب أمنية، ولا نكشف ما إذا كان الحساب موجودًا.' }),
      submit,
    ]);
    box.id = 'shop-login-error';

    var form2 = el('section', { class: 'shop-auth' }, [
      el('h1', { class: 'shop-auth__title', text: 'تسجيل الدخول' }),
      el('p', { class: 'shop-auth__sub', text: 'سجّل الدخول لمتابعة طلباتك وإشعاراتك. التصفح متاح بدون حساب.' }),
      form,
      el('div', { class: 'shop-auth__foot' }, [
        el('span', { text: 'ليس لديك حساب؟' }),
        el('a', { href: shop.buildHash({ path: '/register', query: { next: next } }), text: 'إنشاء حساب جديد' }),
      ]),
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      box.hidden = true;
      var identifier = phone.value.trim();
      var secret = password.value;
      if (!identifier || !secret) {
        showError(box, 'أدخل رقم الهاتف وكلمة المرور.');
        return;
      }
      submit.disabled = true;
      submit.classList.add('btn--busy');
      shop.api.login(identifier, secret).then(function (payload) {
        ALW.session.start(payload || {});
        return shop.api.me().then(function (me) {
          ALW.session.setUser(me || null);
          return me;
        }).catch(function () { return null; });
      }).then(function (me) {
        ALW.app.refreshShell();
        var target = next && next !== '/' ? next : '/';
        if (me) ALW.session.setUser(me);
        ALW.app.afterAuth(target);
      }).catch(function (error) {
        showError(box, (error && error.status === 401) ? 'بيانات الدخول غير صحيحة.' : ((error && error.message) || 'تعذّر تسجيل الدخول. أعد المحاولة.'));
      }).then(function () {
        submit.disabled = false;
        submit.classList.remove('btn--busy');
      });
    });

    view.appendChild(form2);
    global.setTimeout(function () { phone.focus(); }, 40);
    return Promise.resolve(true);
  }

  function registerPage(view, ctx) {
    var next = (ctx.query && ctx.query.next) || '/';
    shop.clear(view);
    view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'إنشاء حساب' }]));

    var first = el('input', { class: 'input', id: 'shop-reg-first', name: 'firstName', required: 'required', autocomplete: 'given-name' });
    var last = el('input', { class: 'input', id: 'shop-reg-last', name: 'lastName', required: 'required', autocomplete: 'family-name' });
    var phone = el('input', { class: 'input', id: 'shop-reg-phone', name: 'phone', type: 'tel', inputmode: 'tel', required: 'required', autocomplete: 'tel', placeholder: '09xxxxxxxx' });
    var email = el('input', { class: 'input', id: 'shop-reg-email', name: 'email', type: 'email', autocomplete: 'email' });
    var password = el('input', { class: 'input', id: 'shop-reg-password', name: 'password', type: 'password', required: 'required', autocomplete: 'new-password' });
    var confirm = el('input', { class: 'input', id: 'shop-reg-confirm', name: 'confirmPassword', type: 'password', required: 'required', autocomplete: 'new-password' });
    var box = errorBox();
    var submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', text: 'إنشاء الحساب' });

    var form = el('form', { class: 'shop-auth__form', attrs: { novalidate: 'novalidate' } }, [
      box,
      el('div', { class: 'shop-auth__grid2' }, [field('الاسم الأول', first), field('الكنية', last)]),
      field('رقم الهاتف', phone, 'سيُستخدم لتسجيل الدخول'),
      field('البريد الإلكتروني (اختياري)', email),
      field('كلمة المرور', password),
      field('تأكيد كلمة المرور', confirm),
      el('p', { class: 'shop-note', text: 'بإنشاء الحساب يمكنك متابعة طلباتك وإشعاراتك. لا نطلب أي بيانات دفع الآن.' }),
      submit,
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      box.hidden = true;
      if (!first.value.trim() || !last.value.trim() || !phone.value.trim()) {
        showError(box, 'أدخل الاسم الأول والكنية ورقم الهاتف.');
        return;
      }
      if (password.value.length < 8) {
        showError(box, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        return;
      }
      if (password.value !== confirm.value) {
        showError(box, 'كلمتا المرور غير متطابقتين.');
        return;
      }
      submit.disabled = true;
      var payload = {
        firstName: first.value.trim(),
        lastName: last.value.trim(),
        phone: phone.value.trim(),
        password: password.value,
        confirmPassword: confirm.value,
      };
      if (email.value.trim()) payload.email = email.value.trim();

      shop.api.register(payload).then(function (result) {
        if (result && result.accessToken) {
          ALW.session.start(result);
          return shop.api.me().then(function (me) {
            ALW.session.setUser(me || null);
            return true;
          }).catch(function () { return true; });
        }
        return false;
      }).then(function (signedIn) {
        ALW.app.refreshShell();
        shop.toast(signedIn ? 'تم إنشاء الحساب وتسجيل الدخول' : 'تم إنشاء الحساب — يمكنك تسجيل الدخول الآن', 'success');
        if (signedIn) {
          ALW.app.afterAuth(next);
        } else {
          var target = shop.hashFor('/login') + (next && next !== '/' ? '&next=' + encodeURIComponent(next) : '');
          if (global.location.hash !== target) global.location.hash = target;
        }
      }).catch(function (error) {
        var message = (error && error.message) || 'تعذّر إنشاء الحساب.';
        if (error && error.fields && error.fields.length) {
          message = error.fields.map(function (item) { return item.message; }).filter(Boolean).join(' • ') || message;
        }
        showError(box, message);
      }).then(function () {
        submit.disabled = false;
      });
    });

    view.appendChild(el('section', { class: 'shop-auth' }, [
      el('h1', { class: 'shop-auth__title', text: 'إنشاء حساب جديد' }),
      el('p', { class: 'shop-auth__sub', text: 'حساب واحد يتابع طلباتك وإشعاراتك — التصفح لا يحتاج حسابًا.' }),
      form,
      el('div', { class: 'shop-auth__foot' }, [
        el('span', { text: 'لديك حساب؟' }),
        el('a', { href: shop.buildHash({ path: '/login', query: { next: next } }), text: 'تسجيل الدخول' }),
      ]),
    ]));
    global.setTimeout(function () { first.focus(); }, 40);
    return Promise.resolve(true);
  }

  /* ------------------------------------------------------------------ 404 */
  function notfound(view, ctx) {
    shop.clear(view);
    view.appendChild(crumbs([{ label: 'الرئيسية', href: '#/' }, { label: 'صفحة غير موجودة' }]));
    view.appendChild(shop.stateBlock('empty', 'الصفحة غير موجودة', 'الرابط ' + (ctx && ctx.path ? ctx.path : '') + ' غير معروف في المتجر.', [
      el('a', { class: 'btn btn--primary', href: '#/', text: 'العودة إلى الرئيسية' }),
      el('a', { class: 'btn btn--secondary', href: '#/products', text: 'تصفّح المنتجات' }),
    ]));
    return Promise.resolve(true);
  }

  var pages = {
    home: home,
    products: products,
    product: product,
    login: loginPage,
    register: registerPage,
    notfound: notfound,
  };

  // أدوات مشتركة تحتاجها صفحات السلة/الـcheckout (Stage 14.2)
  var pageHelpers = {
    el: el,
    crumbs: crumbs,
    fact: fact,
    errorBlock: errorBlock,
    sectionHead: sectionHead,
    productIconSvg: productIconSvg,
  };

  ALW.shopPages = pages;
  ALW.shopPageHelpers = pageHelpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = pages;
})(typeof window !== 'undefined' ? window : globalThis);
