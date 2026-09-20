/**
 * shop.header.js — Stage 15.2
 * تفاعلات الهيدر وقائمة الجوال (فتح/إغلاق/تتابع/قفل تمرير/تركيز) — منطق مُنقول
 * من مشروع Defense (openMobileMenu/closeMobileMenu + stagger + ESC/closer) ومُكيَّف
 * على DOM المتجر. ملف مستقل: لا يمسّ أي منطق تجاري أو API أو صلاحيات.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var doc = global.document;

  var state = { lastFocus: null, open: false };
  var THEME_KEY = 'alwled.theme';

  function menu() { return doc.getElementById('shop-drawer'); }
  function burger() { return doc.getElementById('shop-burger'); }

  function isOpen() { return state.open; }

  function lockScroll(lock) {
    // قفل على html و body معاً (متصفح الجوال يتجاهل body وحده)
    if (lock) {
      state.prevHtml = doc.documentElement.style.overflow;
      state.prevBody = doc.body.style.overflow;
      doc.documentElement.style.overflow = 'hidden';
      doc.body.style.overflow = 'hidden';
      doc.body.classList.add('menu-open');
    } else {
      doc.documentElement.style.overflow = state.prevHtml || '';
      doc.body.style.overflow = state.prevBody || '';
      doc.body.classList.remove('menu-open');
    }
  }

  function syncHeaderOffset() {
    var header = doc.querySelector('.shop-header');
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) doc.body.style.setProperty('--hdrmenu-top', h + 'px');
    // (PHASE 2.2) ارتفاع صف التحكم الأساسي فقط — تُبدأ منه القائمة المنسدلة
    var row = doc.querySelector('.shop-header__inner');
    if (row) {
      var rh = Math.round(row.getBoundingClientRect().height);
      if (rh > 0) doc.body.style.setProperty('--hdrrow-top', rh + 'px');
    }
  }

  function staggerItems(node) {
    var items = node.querySelectorAll('.shop-drawer__link, .shop-menu__link, .shop-menu__stagger, .shop-drawer__group-title, .shop-menu__label, .shop-menu__divider, .shop-menu__theme, .shop-drawer__foot > *');
    Array.prototype.forEach.call(items, function (el, i) {
      // (PHASE 2.2) تتابع 28ms مع سقف 200ms — الإحساس الكلي سريع (≤350ms)
      el.style.transitionDelay = Math.min(i * 0.028, 0.2) + 's';
    });
  }

  function clearDelays(node) {
    Array.prototype.forEach.call(
      node.querySelectorAll('.shop-drawer__link, .shop-menu__link, .shop-menu__stagger, .shop-drawer__group-title, .shop-menu__label, .shop-menu__divider, .shop-menu__theme, .shop-drawer__foot > *'),
      function (el) { el.style.transitionDelay = '0s'; }
    );
  }

  function focusables(node) {
    return node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  }

  function open() {
    var node = menu();
    if (!node || state.open) return;
    syncHeaderOffset();
    positionThemeThumb(false);
    staggerItems(node);
    node.hidden = false;
    node.setAttribute('aria-hidden', 'false');
    state.open = true;

    // تسلسل إطارين: نعرض حالة «قبل» أولاً ثم نطبّق is-open في الإطار التالي،
    // وإلا يطبّق المتصفح الحالة النهائية فوراً بلا أي انتقال (لا حركة).
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      node.classList.add('is-open');
      positionThemeThumb(false);
    } else {
      node.classList.remove('is-closing', 'is-open');
      node.classList.add('is-opening');
      void node.offsetWidth;                        // إجبار حساب الأنماط للحالة الأولى
      global.requestAnimationFrame(function () {
        if (!state.open) return;                    // أُغلقت قبل الإطار التالي
        node.classList.remove('is-opening');
        node.classList.add('is-open');
        // الآن اللوحة مرئية والمقاسات صحيحة ⇒ يضبط مؤشر المظهر مكانه
        positionThemeThumb(false);
      });
    }
    state.lastFocus = doc.activeElement;
    var b = burger();
    if (b) b.setAttribute('aria-expanded', 'true');
    lockScroll(true);
    doc.addEventListener('keydown', onKeydown, true);
    var first = focusables(node)[0];
    if (first) first.focus({ preventScroll: true });
  }

  function close(immediate) {
    var node = menu();
    if (!node || !state.open) return;
    node.classList.remove('is-open', 'is-opening');
    node.setAttribute('aria-hidden', 'true');
    state.open = false;
    var b = burger();
    if (b) b.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    doc.removeEventListener('keydown', onKeydown, true);

    function finish() {
      if (state.open) return;                 // أُعيد الفتح أثناء الانتقال
      clearDelays(node);
      node.hidden = true;
      if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus({ preventScroll: true });
      state.lastFocus = null;
    }

    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (immediate || reduce) { finish(); return; }
    node.classList.add('is-closing');
    global.setTimeout(function () { node.classList.remove('is-closing'); finish(); }, 230);
  }

  function toggle() { if (state.open) close(); else open(); }

  function onKeydown(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    var node = menu();
    if (!node) return;
    var items = focusables(node);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = doc.activeElement;
    if (event.shiftKey && (active === first || !node.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !node.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------ المظهر (فاتح/داكن/النظام) */
  /** يحرّك المؤشر المنزلق إلى الزر المختار بحركة سلسة (بلا أثر ضغط على الزر نفسه). */
  function positionThemeThumb(animate) {
    var wrap = doc.querySelector('.shop-menu__theme');
    if (!wrap) return;
    var thumb = wrap.querySelector('.shop-menu__theme-thumb');
    var active = wrap.querySelector('.shop-menu__theme-btn.is-active');
    if (!thumb || !active) return;
    if (!animate) thumb.style.transition = 'none';
    thumb.style.width = active.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    if (!animate) {
      global.requestAnimationFrame(function () { thumb.style.transition = ''; });
    }
  }

  function applyTheme(mode) {
    var dark = mode === 'dark' ||
      (mode === 'system' && !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches));
    doc.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    Array.prototype.forEach.call(doc.querySelectorAll('.shop-menu__theme-btn'), function (btn) {
      var on = btn.getAttribute('data-theme-mode') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // المؤشر ينتقل إلى الاختيار الجديد بحركة منزلقة
    if (themeThumbReady) positionThemeThumb(true);
  }

  var themeThumbReady = false;

  function setTheme(mode) {
    try { global.localStorage.setItem(THEME_KEY, mode); } catch (error) { /* storage محجوب */ }
    applyTheme(mode);
  }

  function currentTheme() {
    try { return global.localStorage.getItem(THEME_KEY) || 'system'; } catch (error) { return 'system'; }
  }


  /* ------------------------------------------------ قائمة الملف الشخصي (زر الهيدر) */
  var profile = { node: null, open: false };

  function profileItems() {
    var unread = (ALW.app && ALW.app.unreadCount) ? ALW.app.unreadCount() : null;
    return [
      { label: 'حسابي', href: '#/account', icon: 'user' },
      { label: 'طلباتي', href: '#/orders', icon: 'clipboard' },
      { label: 'إشعاراتي' + (unread ? ' (' + unread + ')' : ''), href: '#/notifications', icon: 'bell' },
      { label: 'توثيق الحساب', href: '#/verification', icon: 'check' },
      { label: 'تسجيل الخروج', action: 'logout', icon: 'logout', danger: true },
    ];
  }

  var ICON_MAP = { bell: 'bell', cart: 'shopping-cart', user: 'user', logout: 'log-out', login: 'log-in', clipboard: 'clipboard-list', check: 'circle-check', box: 'package', history: 'clock', alert: 'circle-alert', search: 'search', x: 'x', grid: 'layout-grid', folder: 'folder', tag: 'tag', home: 'house', house: 'house', sun: 'sun', moon: 'moon', monitor: 'monitor', 'user-plus': 'user-plus' };

  function svgIcon(name, size) {
    var key = ICON_MAP[name] || name;
    if (ALW.icons && ALW.icons.node) return ALW.icons.node(key, size || 19);
    return doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  }

  function buildProfileMenu() {
    if (profile.node) return profile.node;
    var header = doc.querySelector('.shop-header');
    if (!header) return null;
    var box = doc.createElement('div');
    box.className = 'shop-profile-menu';
    box.id = 'shop-profile-menu';
    box.setAttribute('role', 'menu');
    box.setAttribute('aria-label', 'قائمة الحساب');
    box.hidden = true;
    profileItems().forEach(function (item) {
      var node;
      if (item.action === 'logout') {
        node = doc.createElement('button');
        node.type = 'button';
        node.addEventListener('click', function () {
          closeProfile();
          if (ALW.app && ALW.app.logout) ALW.app.logout();
        });
      } else {
        node = doc.createElement('a');
        node.href = item.href;
        node.addEventListener('click', function () { closeProfile(true); });
      }
      node.className = 'shop-profile-menu__item' + (item.danger ? ' shop-profile-menu__item--danger' : '');
      node.setAttribute('role', 'menuitem');
      node.appendChild(svgIcon(item.icon));
      var span = doc.createElement('span');
      span.textContent = item.label;
      node.appendChild(span);
      box.appendChild(node);
    });
    header.appendChild(box);
    profile.node = box;
    return box;
  }

  function openProfile() {
    var box = buildProfileMenu();
    var btn = doc.getElementById('shop-user-btn');
    if (!box) return;
    box.hidden = false;
    box.classList.add('is-opening');
    void box.offsetWidth;
    global.requestAnimationFrame(function () { box.classList.remove('is-opening'); box.classList.add('is-open'); });
    profile.open = true;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    doc.addEventListener('keydown', profileKeydown, true);
    // التركيز بعد استقرار حدث النقر (وإلا يعيده المتصفح إلى الزر)
    global.requestAnimationFrame(function () {
      var first = box.querySelector('.shop-profile-menu__item');
      if (first && profile.open) first.focus({ preventScroll: true });
    });
  }

  function closeProfile(immediate) {
    var box = profile.node;
    var btn = doc.getElementById('shop-user-btn');
    if (!box || !profile.open) return;
    profile.open = false;
    box.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('keydown', profileKeydown, true);
    if (immediate) { box.hidden = true; return; }
    global.setTimeout(function () { if (!profile.open) box.hidden = true; }, 200);
  }

  function profileKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeProfile(); }
  }

  function initProfile() {
    // تفويض: الزر يُعاد بناؤه عند كل تغيير جلسة
    doc.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('#shop-user-btn');
      if (btn) {
        event.preventDefault();
        if (profile.open) closeProfile(); else openProfile();
        return;
      }
      if (profile.open && profile.node && !profile.node.contains(event.target)) closeProfile();
    });
    global.addEventListener('hashchange', function () { if (profile.open) closeProfile(true); });
    global.addEventListener('resize', function () { if (profile.open) closeProfile(true); });
  }

  /* ------------------------------------------------ init */
  function init() {
    initProfile();
    if (!menu()) return;
    syncHeaderOffset();
    applyTheme(currentTheme());
    positionThemeThumb(false);
    themeThumbReady = true;

    var b = burger();
    if (b) {
      b.setAttribute('aria-controls', 'shop-drawer');
      b.setAttribute('aria-expanded', 'false');
      // زر القائمة يفتح/يغلق (نمط المرجع)
      b.addEventListener('click', function (event) {
        event.preventDefault();
        toggle();
      });
    }

    // إغلاق عند اختيار أي رابط داخل القائمة + تمرير سلس للبند المضغوط
    Array.prototype.forEach.call(doc.querySelectorAll('#shop-drawer a[href]'), function (link) {
      link.addEventListener('pointerdown', function () {
        var area = doc.getElementById('shop-menu-scroll');
        if (!area || !area.contains(link)) return;
        var lr = link.getBoundingClientRect();
        var ar = area.getBoundingClientRect();
        if (lr.top < ar.top || lr.bottom > ar.bottom) {
          link.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
      link.addEventListener('click', function () { close(true); });
    });

    // زر الإغلاق + أي عنصر data-drawer-close
    Array.prototype.forEach.call(doc.querySelectorAll('#shop-drawer-close, [data-drawer-close]'), function (node) {
      node.addEventListener('click', function (event) { event.preventDefault(); close(); });
    });

    // النقر خارج اللوحة (منطقة الهيدر) يغلقها — نمط «click outside»
    var header = doc.querySelector('.shop-header');
    if (header) {
      header.addEventListener('click', function (event) {
        if (!state.open) return;
        if (event.target.closest('#shop-burger, a, button')) return;
        close();
      });
    }

    // مبدّل المظهر
    Array.prototype.forEach.call(doc.querySelectorAll('.shop-menu__theme-btn'), function (btn) {
      btn.addEventListener('click', function () { setTheme(btn.getAttribute('data-theme-mode')); });
    });

    // ظل الهيدر عند التمرير + تحديث ارتفاعه للقائمة
    global.addEventListener('scroll', function () {
      var header = doc.querySelector('.shop-header');
      if (header) header.classList.toggle('is-scrolled', global.scrollY > 4);
    }, { passive: true });

    global.addEventListener('resize', function () {
      syncHeaderOffset();
      positionThemeThumb(false);
      if (global.innerWidth >= 1024 && state.open) close(true);  // سطح المكتب: لا قائمة منسدلة
    });

    // إغلاق عند تغيير المسار (#hash)
    global.addEventListener('hashchange', function () { if (state.open) close(true); });

    // تركيز القائمة عند فتحها عبر لوحة المفاتيح فقط
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'F6') { event.preventDefault(); open(); }
    });
  }

  ALW.shopHeader = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    setTheme: setTheme,
    positionThemeThumb: positionThemeThumb,
    openProfile: openProfile,
    closeProfile: closeProfile,
    applyTheme: applyTheme,
    syncHeaderOffset: syncHeaderOffset,
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
