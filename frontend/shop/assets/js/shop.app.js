/**
 * alwled shop — البناء والتشغيل: إعداد الـAPI المركزي، الموجّه (hash router)، الهيدر/الدروer، والجلسة.
 * لا يلمس أي شيء يخص لوحة الإدارة: نفس الـsession/نفس الـAPI، وواجهة مستقلة تمامًا.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;

  function el(tag, options, children) {
    return shop.el(tag, options, children);
  }

  /* ---------------------------------------------------------------- API bootstrap */
  function bootstrapApi() {
    if (ALW.config && typeof ALW.config.applyDocumentOverrides === 'function') {
      ALW.config.applyDocumentOverrides(global.document, global.location ? global.location.search : '');
    }
    ALW.api.configure({
      config: ALW.config,
      session: ALW.session,
      fetchImpl: typeof global.fetch === 'function' ? global.fetch.bind(global) : null,
      onUnauthorized: function () {
        refreshShell();
      },
      refresh: function () {
        var token = ALW.session && ALW.session.getRefresh ? ALW.session.getRefresh() : null;
        if (!token) return Promise.resolve(null);
        return shop.api.refresh(token).then(function (payload) {
          if (!payload || !payload.accessToken) return null;
          ALW.session.start(payload);
          refreshShell();
          return payload.accessToken;
        }).catch(function () {
          return null;
        });
      },
    });
  }

  function restoreSession() {
    if (!ALW.session || !ALW.session.hasRefresh || !ALW.session.hasRefresh()) {
      return Promise.resolve(false);
    }
    return shop.api.me().then(function (me) {
      ALW.session.setUser(me || null);
      // إن كان الزائر قد فتح نافذة الدعوة قبل اكتمال استعادة الجلسة، تُغلق الآن (لا تحجب النقر لاحقاً)
      shop.closeAuthPrompt();
      refreshShell();
      return true;
    }).catch(function () {
      ALW.session.expire();
      refreshShell();
      return false;
    });
  }

  /* ---------------------------------------------------------------- theme */
  var THEME_KEY = 'alwled.theme';

  function applyStoredTheme() {
    try {
      var stored = global.localStorage ? global.localStorage.getItem(THEME_KEY) : null;
      if (stored === 'dark' || stored === 'light') {
        global.document.documentElement.setAttribute('data-theme', stored);
      }
    } catch (error) {
      /* storage blocked — keep the default theme */
    }
  }

  /* ---------------------------------------------------------------- shell (header / drawer) */
  var shellNodes = {};

  function initials(user) {
    var first = (user && (user.firstName || user.first_name)) || '';
    var last = (user && (user.lastName || user.last_name)) || '';
    var text = (String(first).charAt(0) + String(last).charAt(0)).trim();
    if (text) return text;
    var phone = (user && user.phone) || '';
    return phone ? String(phone).slice(-2) : '؟';
  }

  var ICON_PATHS = {
    bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 01-3.4 0',
    cart: 'M3 4h2.2l2.3 10.2h11.1L21 7.5H6|C9.5 19.5 1.5 1.5 0 0 0|C17.5 19.5 1.5 1.5 0 0 0',
    user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z|M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9'
  };

  /** أيقونة SVG خطية محلية (بلا CDN): نفس نمط أيقونات مرجع التصميم. */
  var ICON_MAP = { bell: 'bell', cart: 'shopping-cart', user: 'user', logout: 'log-out', login: 'log-in', clipboard: 'clipboard-list', check: 'circle-check', box: 'package', history: 'clock', alert: 'circle-alert', search: 'search', x: 'x', grid: 'layout-grid', folder: 'folder', tag: 'tag', home: 'house', house: 'house', sun: 'sun', moon: 'moon', monitor: 'monitor', 'user-plus': 'user-plus' };

  /** أيقونة من مكتبة المشروع (Lucide — نفس مكتبة مرجع التصميم). */
  function iconNode(name, size) {
    var key = ICON_MAP[name] || name;
    if (ALW.icons && ALW.icons.node) return ALW.icons.node(key, size || 21);
    return null;
  }

  /** بند داخل القائمة الجانبية: أيقونة Lucide + نص + شارة عدد اختيارية. */
  function menuRow(href, iconName, label, badgeText, badgeId) {
    var opts = { class: 'shop-drawer__link', href: href, attrs: { 'aria-label': label } };
    var children = [
      el('span', { class: 'shop-drawer__link__icon', attrs: { 'aria-hidden': 'true' } }, [iconNode(iconName, 22)]),
      el('span', { text: label }),
    ];
    if (badgeText !== null && badgeText !== undefined) {
      // المعرّف على الشارة نفسها (textContent = الرقم فقط)
      children.push(el('span', { class: 'shop-menu__badge', id: badgeId || null, text: badgeText }));
    }
    return el('a', opts, children);
  }

  function renderShell() {
    var actions = global.document.getElementById('shop-actions');
    var drawerAccount = global.document.getElementById('shop-drawer-account');
    if (!actions) return;
    var authenticated = shop.visitorState() === 'authenticated';
    var user = (ALW.session && ALW.session.user && ALW.session.user()) || null;

    shop.clear(actions);
    shop.clear(drawerAccount);
    // تفريغ قسم «حسابي» في القائمة قبل إعادة البناء (وإلا تتكرر البنود والشارات)
    var menuAccount = global.document.getElementById('shop-menu-account');
    if (menuAccount) shop.clear(menuAccount);

    // جرس الإشعارات (للمسجّل فقط) — العدد من GET /notifications/unread-count حصراً.
    // الترتيب: الهيدر يحتفظ به على الديسكتوب فقط، وعلى الجوال ينتقل إلى القائمة الجانبية.
    if (authenticated) {
      var count = shellNodes.unreadCount;
      var bellLabel = count ? 'الإشعارات — ' + count + ' غير مقروء' : 'الإشعارات';
      actions.appendChild(el('a', {
        class: 'shop-bell', href: '#/notifications', id: 'shop-bell',
        attrs: { 'aria-label': bellLabel },
      }, [
        iconNode('bell', 21),
        count
          ? el('span', { class: 'shop-bell__badge', id: 'shop-bell-badge-desktop', text: count > 99 ? '99+' : String(count) })
          : null,
      ]));
    }

    // زر السلة في الهيدر + شارة العدد (العدد من رد الـBackend فقط)
    var badgeCount = ALW.shopCart ? ALW.shopCart.totalQuantity() : 0;
    actions.appendChild(el('a', {
      class: 'shop-cartbtn', href: '#/cart', id: 'shop-cart-button',
      attrs: { 'aria-label': badgeCount ? 'السلة — ' + badgeCount + ' قطعة' : 'السلة' },
    }, [
      iconNode('cart', 21),
      el('span', { class: 'shop-cartbtn__label', text: 'السلة' }),
      badgeCount
        ? el('span', { class: 'shop-cartbtn__badge', id: 'shop-cart-badge', text: badgeCount > 99 ? '99+' : String(badgeCount) })
        : null,
    ]));

    if (authenticated) {
      // بنود الحساب داخل القائمة الجانبية (جوال): الإشعارات بشارة العدد + الطلبات + التوثيق + الحساب + خروج
      if (menuAccount) {
        menuAccount.appendChild(menuRow('#/notifications', 'bell', 'الإشعارات',
          count ? String(Math.min(count, 99)) : null, 'shop-bell-badge'));
        menuAccount.appendChild(menuRow('#/orders', 'clipboard', 'طلباتي'));
        menuAccount.appendChild(menuRow('#/verification', 'check', 'توثيق الحساب'));
        menuAccount.appendChild(menuRow('#/account', 'user', 'حسابي'));
        menuAccount.appendChild(el('button', {
          class: 'shop-drawer__link shop-drawer__link--danger', type: 'button',
          onclick: function () { logout(); },
        }, [el('span', { class: 'shop-drawer__link__icon', attrs: { 'aria-hidden': 'true' } }, [iconNode('logout', 21)]),
            el('span', { text: 'تسجيل الخروج' })]));
      }

      // زر الملف الشخصي في الهيدر (ديسكتوب فقط — يبقى كما هو مع قائمته المنسدلة)
      actions.appendChild(el('button', {
        class: 'shop-user', type: 'button', id: 'shop-user-btn',
        attrs: {
          'aria-label': 'قائمة الحساب — ' + (((user && (user.firstName || user.phone)) || 'عميل')),
          'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'shop-profile-menu',
        },
        title: (user && (user.firstName || user.phone)) || 'حسابي',
      }, [iconNode('user', 21)]));
    } else {
      actions.appendChild(el('a', { class: 'btn btn--ghost btn--sm', href: '#/login', text: 'تسجيل الدخول' }));
      actions.appendChild(el('a', { class: 'btn btn--primary btn--sm', href: '#/register', text: 'إنشاء حساب' }));
      drawerAccount.appendChild(el('p', { class: 'shop-note', text: 'تصفّح بدون حساب — سجّل الدخول لمتابعة طلبك.' }));
      drawerAccount.appendChild(el('a', { class: 'btn btn--primary btn--block', href: '#/products', text: 'تصفّح المنتجات', attrs: { style: 'margin-top:8px' } }));
    }

    // معلومات المستخدم المختصرة في أعلى القائمة (للمسجّل فقط)
    var menuUser = global.document.getElementById('shop-menu-user');
    if (menuUser) {
      shop.clear(menuUser);
      if (authenticated) {
        var displayName = (user && (user.firstName || user.phone)) || 'عميل';
        menuUser.hidden = false;
        var avatarText = initials(user);
        if (!avatarText || avatarText === '؟') avatarText = String(displayName).trim().charAt(0) || 'ع';
        menuUser.appendChild(el('span', { class: 'shop-menu__user-avatar', text: avatarText }));
        menuUser.appendChild(el('span', { class: 'shop-menu__user-main' }, [
          el('strong', { text: displayName }),
          user && user.phone ? el('small', { text: String(user.phone) }) : null,
        ]));
      } else {
        menuUser.hidden = true;
      }
    }

    // قسم «حسابك» للزائر · قسم «حسابي» للمسجّل (لا تكرار في الحالتين)
    if (global.document.body) global.document.body.classList.toggle('is-authed', authenticated);
    var guestBlock = global.document.getElementById('shop-menu-guest');
    if (guestBlock) guestBlock.hidden = authenticated;
    if (menuAccount) menuAccount.hidden = !authenticated;
  }

  function refreshShell() {
    renderShell();
    markActiveNav();
  }

  /**
   * عدّاد الإشعارات غير المقروءة من GET /notifications/unread-count فقط.
   * لا polling عدائي: نداء واحد عند البداية وبعد الأحداث، ومرة كل 20 ثانية كحدّ أقصى عند التنقل.
   */
  var unreadFetchedAt = 0;

  function refreshNotifications(force) {
    if (shop.visitorState() !== 'authenticated') {
      shellNodes.unreadCount = 0;
      refreshShell();
      return Promise.resolve(0);
    }
    var now = Date.now();
    if (!force && now - unreadFetchedAt < 20000) return Promise.resolve(shellNodes.unreadCount || 0);
    unreadFetchedAt = now;
    return shop.api.unreadCount().then(function (payload) {
      var count = payload && typeof payload.count === 'number' ? payload.count : null;
      shellNodes.unreadCount = count === null ? null : count;
      refreshShell();
      return shellNodes.unreadCount;
    }).catch(function () {
      // فشل الشبكة: لا نعرض رقماً وهمياً — نُبقي الشارة بلا عدد
      shellNodes.unreadCount = null;
      refreshShell();
      return null;
    });
  }

  function markActiveNav() {
    var state = shop.parseHash(global.location.hash);
    var map = { home: 'home', products: 'products' };
    var active = map[state.name];
    if (state.name === 'products' && state.query && state.query.view === 'categories') active = 'categories';
    if (state.name === 'products' && state.query && state.query.view === 'brands') active = 'brands';
    Array.prototype.forEach.call(global.document.querySelectorAll('.shop-nav__link'), function (link) {
      if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    // روابط الدرج: نفس الحالة النشِطة (لا تغيير في الوجهات)
    var drawerMap = { '#/': 'home', '#/products': 'products', '#/products?view=categories': 'categories', '#/products?view=brands': 'brands' };
    Array.prototype.forEach.call(global.document.querySelectorAll('.shop-drawer__link'), function (link) {
      var key = link.getAttribute('href');
      var isActive = drawerMap[key] && drawerMap[key] === (state.name === 'products' && state.query && state.query.view === 'categories' ? 'categories'
        : state.name === 'products' && state.query && state.query.view === 'brands' ? 'brands'
        : state.name === 'products' ? 'products'
        : state.name === 'home' ? 'home' : '');
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  /* ---------------------------------------------------------------- drawer */
  var drawerTimers = { close: null };

  function drawerNode() {
    return global.document.getElementById('shop-drawer');
  }

  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function drawerFocusables(drawer) {
    return drawer.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  function openDrawer() {
    // Stage 15.2: القائمة (الهيدر/المنيو) تدار في shop.header.js المستقل
    if (ALW.shopHeader && typeof ALW.shopHeader.open === 'function') return ALW.shopHeader.open();
    var drawer = drawerNode();
    var burger = global.document.getElementById('shop-burger');
    if (!drawer) return;
    global.clearTimeout(drawerTimers.close);
    shellNodes.drawerLastFocus = global.document.activeElement;
    shellNodes.prevOverflow = global.document.body.style.overflow;
    global.document.body.style.overflow = 'hidden';
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.remove('is-closing', 'is-open');
    drawer.classList.add('is-opening');           // حالة البداية: منزلق خارج الشاشة
    if (burger) burger.setAttribute('aria-expanded', 'true');
    global.document.addEventListener('keydown', drawerKeydown, true);
    (function animate() {
      if (reducedMotion()) {
        drawer.classList.remove('is-opening');
        drawer.classList.add('is-open');
      } else {
        global.requestAnimationFrame(function () {
          drawer.classList.remove('is-opening');
          drawer.classList.add('is-open');
        });
      }
    })();
    var close = global.document.getElementById('shop-drawer-close');
    if (close) close.focus();
  }

  function closeDrawer(immediate) {
    if (ALW.shopHeader && typeof ALW.shopHeader.close === 'function') return ALW.shopHeader.close(immediate);
    var drawer = drawerNode();
    var burger = global.document.getElementById('shop-burger');
    if (!drawer || drawer.hidden) return;
    if (burger) burger.setAttribute('aria-expanded', 'false');
    global.document.removeEventListener('keydown', drawerKeydown, true);
    // استعادة قيمة التمرير السابقة بدل ضبطها فارغة (يمنع تعليق الصفحة)
    global.document.body.style.overflow = shellNodes.prevOverflow || '';
    shellNodes.prevOverflow = null;

    function finish() {
      drawer.classList.remove('is-open', 'is-closing', 'is-opening');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.hidden = true;
      if (shellNodes.drawerLastFocus && shellNodes.drawerLastFocus.focus) shellNodes.drawerLastFocus.focus();
      shellNodes.drawerLastFocus = null;
    }

    if (immediate || reducedMotion()) {
      global.clearTimeout(drawerTimers.close);
      finish();
      return;
    }
    drawer.classList.remove('is-open');
    drawer.classList.add('is-closing');
    global.clearTimeout(drawerTimers.close);
    drawerTimers.close = global.setTimeout(finish, 230);
  }

  function drawerKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    var drawer = drawerNode();
    if (!drawer || drawer.hidden) return;
    var items = drawerFocusables(drawer);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = global.document.activeElement;
    if (event.shiftKey && (active === first || !drawer.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /* أقسام الفوتر: accordion مطويّ افتراضيًا على كل العروض (MICRO-COMPACT) —
     كان يُفرض open على >640px ⇒ ديسكتوب 283px خارج هدف 140–190 ✗ */
  function setupFooterSections() {
    var sections = global.document.querySelectorAll('.shop-footer__sec');
    if (!sections.length) return;
    Array.prototype.forEach.call(sections, function (node) {
      node.removeAttribute('open');
    });
  }

  /* ---------------------------------------------------------------- auth actions */
  /**
   * بعد نجاح الدخول/التسجيل: نُكمل نيّة «أضف إلى السلة» إن وُجدت ثم ننتقل إلى الوجهة المطلوبة.
   * لا redirect loop: الوجهة تُبنى مرة واحدة من next، والقيمة الافتراضية الرئيسية.
   */
  function afterAuth(next) {
    var target = (next && String(next).charAt(0) === '/') ? next : '/';
    refreshShell();
    return Promise.resolve(ALW.shopCart ? ALW.shopCart.completePendingAdd() : null).then(function (result) {
      return Promise.resolve(ALW.shopCart ? ALW.shopCart.load() : null).then(function () {
        refreshShell();
        if (result && result.added) {
          shop.toast('تمت إضافة المنتج إلى سلتك', 'success');
          target = '/cart';
        } else if (result && result.error) {
          shop.toast(result.error.message, 'warning');
          target = '/cart';
        }
        var hash = shop.hashFor(target);
        if (global.location.hash !== hash) global.location.hash = hash;
        return result;
      });
    });
  }

  function logout() {
    var token = ALW.session && ALW.session.getRefresh ? ALW.session.getRefresh() : null;
    var done = function () {
      ALW.session.clear();
      if (ALW.shopCart) ALW.shopCart.reset();
      shellNodes.unreadCount = null;
      ALW.shop.closeAuthPrompt();
      refreshShell();
      shop.toast('تم تسجيل الخروج', 'info');
      var hash = shop.hashFor('/');
      if (global.location.hash !== hash) global.location.hash = hash;
    };
    if (!token) {
      done();
      return;
    }
    shop.api.logout(token).then(done).catch(done);
  }

  /* ---------------------------------------------------------------- router */
  var RENDERERS = {
    home: 'home', products: 'products', product: 'product', login: 'login', register: 'register',
    cart: 'cart', checkout: 'checkout', account: 'account', notfound: 'notfound',
    orders: 'orders', order: 'order', payment: 'payment', notifications: 'notifications', verification: 'verification',
  };

  var routing = false;

  function renderRoute() {
    var view = global.document.getElementById('shop-view');
    if (!view) return Promise.resolve(false);
    var state = shop.parseHash(global.location.hash);
    shellNodes.renderedAsVisitor = shop.visitorState() !== 'authenticated';
    var renderer = ALW.shopPages[RENDERERS[state.name] || 'notfound'];
    routing = true;
    closeDrawer(true);
    shop.closeAuthPrompt();
    markActiveNav();
    global.document.title = titleFor(state);
    return Promise.resolve(renderer(view, state)).then(function (result) {
      routing = false;
      return result;
    }).catch(function () {
      routing = false;
      return false;
    });
  }

  function titleFor(state) {
    var base = 'الوليد للأجهزة الكهربائية';
    if (state.name === 'products') return state.query && state.query.view === 'categories' ? 'التصنيفات — ' + base : 'المنتجات — ' + base;
    if (state.name === 'product') return 'تفاصيل المنتج — ' + base;
    if (state.name === 'login') return 'تسجيل الدخول — ' + base;
    if (state.name === 'register') return 'إنشاء حساب — ' + base;
    if (state.name === 'cart') return 'السلة — ' + base;
    if (state.name === 'checkout') return 'ملخّص الطلب — ' + base;
    if (state.name === 'account') return 'حسابي — ' + base;
    if (state.name === 'orders') return 'طلباتي — ' + base;
    if (state.name === 'order') return 'تفاصيل الطلب — ' + base;
    if (state.name === 'payment') return 'دفع الطلب — ' + base;
    if (state.name === 'notifications') return 'إشعاراتي — ' + base;
    if (state.name === 'verification') return 'توثيق الحساب — ' + base;
    if (state.name === 'notfound') return 'صفحة غير موجودة — ' + base;
    return base + ' — متجر';
  }

  /* ---------------------------------------------------------------- init */
  function init() {
    applyStoredTheme();
    bootstrapApi();
    renderShell();
    markActiveNav();

    setupFooterSections();

    var headerOwnsMenu = !!(ALW.shopHeader && typeof ALW.shopHeader.toggle === 'function');
    if (!headerOwnsMenu) {
      var burger = global.document.getElementById('shop-burger');
      var close = global.document.getElementById('shop-drawer-close');
      if (burger) burger.addEventListener('click', openDrawer);
      if (close) close.addEventListener('click', closeDrawer);
      Array.prototype.forEach.call(global.document.querySelectorAll('[data-drawer-close]'), function (node) {
        node.addEventListener('click', closeDrawer);
      });
    }

    var searchForm = global.document.getElementById('shop-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = global.document.getElementById('shop-search-input');
        var term = input ? input.value.trim() : '';
        global.location.hash = shop.buildHash({ path: '/products', query: term ? { search: term } : {} });
      });
    }

    var year = global.document.getElementById('shop-year');
    if (year) year.textContent = String(new Date().getFullYear());

    global.addEventListener('hashchange', function () {
      renderRoute().then(function () { global.scrollTo({ top: 0, behavior: 'auto' }); });
      refreshNotifications(false);
    });

    if (!global.location.hash) {
      global.location.hash = '#/';
    } else {
      renderRoute();
    }

    // شارة السلة تتبع حالة السلة الحقيقية من الـBackend
    if (ALW.shopCart) {
      ALW.shopCart.onChange(function () {
        refreshShell();
      });
    }

    restoreSession().then(function (authenticated) {
      refreshNotifications(true);
      if (authenticated && ALW.shopCart) ALW.shopCart.load();
      // مسار خاص فُتح قبل اكتمال الاستعادة: يُعاد رسمه مرة واحدة بحالة مصادَقة (لا guard كاذب)
      if (authenticated && shellNodes.renderedAsVisitor) {
        shellNodes.renderedAsVisitor = false;
        renderRoute();
      }
    });
  }

  ALW.app = {
    init: init,
    renderRoute: renderRoute,
    refreshShell: refreshShell,
    refreshNotifications: refreshNotifications,
    unreadCount: function () { return shellNodes.unreadCount; },
    afterAuth: afterAuth,
    logout: logout,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    restoreSession: restoreSession,
  };

  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
