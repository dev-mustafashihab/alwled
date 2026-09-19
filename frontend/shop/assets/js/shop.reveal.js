/**
 * alwled shop — PHASE 2.1: كشف متلاشي لكل عنصر (fade-in-up).
 * - IntersectionObserver (لا مكتبات) · stagger تدريجي · إعادة المسح بعد كل تنقّل/رسم.
 * - بلا JS ⇒ لا شيء يُخفى (الأصناف تُضاف من هنا فقط).
 * - prefers-reduced-motion ⇒ يتوقف تمامًا.
 * - أمان: بعد 1200ms يُكشف أي عنصر ما زال مخفيًا (لا محتوى مفقود أبدًا).
 */
(function () {
  'use strict';
  var doc = document;
  var TARGETS = [
    '.shop-section', '.shop-section__head', '.shop-card', '.shop-taxonomy__item',
    '.shop-home-slider', '.shop-home-ticker', '.shop-benefit', '.shop-brands__item',
    '.shop-crumbs', '.shop-toolbar', '.shop-filters__toggle', '.shop-panel',
    '.shop-gallery', '.shop-buy', '.shop-buy__facts', '.shop-buy__actions',
    '.shop-cart__item', '.shop-cart__summary', '.shop-order', '.shop-notif',
    '.shop-prose', '.state', '.pagination', '.shop-footer__sec', '.shop-auth__card'
  ].join(',');
  var STAGGER = 55;          /* ms بين عنصر وعنصر في نفس الدفعة */
  var MAX_DELAY = 330;

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function scan(root) {
    var scope = root || doc;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll(TARGETS) : [];
    var batch = 0;
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.hasAttribute('data-stw-reveal')) return;
      el.setAttribute('data-stw-reveal', '1');
      el.classList.add('stw-reveal');
      if (el.matches('.shop-home-ticker, .shop-crumbs, .pagination, .shop-footer__sec')) el.classList.add('stw-reveal--fade');
      el.style.setProperty('--stw-reveal-delay', Math.min(batch * STAGGER, MAX_DELAY) + 'ms');
      batch += 1;
      if (io) io.observe(el);
      else reveal(el);
    });
  }

  function reveal(el) {
    if (el.classList.contains('is-revealed')) return;
    el.classList.add('is-revealed');
    if (io) io.unobserve(el);
  }

  var io = null;
  if ('IntersectionObserver' in window && !reduced()) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { reveal(en.target); return; }
        /* عنصر تجاوزناه بالقفز/التمرير السريع (فوق العرض) ⇒ يُكشف فورًا */
        var r = en.boundingClientRect;
        if (r.bottom < 0 || (r.top < 0 && r.bottom < (window.innerHeight || 0))) reveal(en.target);
      });
    }, { root: null, rootMargin: '600px 0px -8% 0px', threshold: 0.08 });
  }

  function start() {
    if (reduced()) {                       /* إتاحة أولًا: بلا أي إخفاء */
      doc.documentElement.classList.remove('stw-reveal-on');
      return;
    }
    doc.documentElement.classList.add('stw-reveal-on');
    scan();
    /* إعادة المسح بعد إعادة رسم الصفحات (SPA) */
    var view = doc.getElementById('shop-view');
    if (view && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () { scan(view); });
      mo.observe(view, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', function () { setTimeout(function () { scan(view || doc); }, 30); });
    /* أمان: لا محتوى مخفي بعد 1200ms */
    setTimeout(function () {
      var hidden = doc.querySelectorAll('.stw-reveal:not(.is-revealed)');
      Array.prototype.forEach.call(hidden, function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 0) + 120) reveal(el);
      });
    }, 1200);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  window.__stwReveal = { scan: scan, reveal: reveal, targets: TARGETS };
})();

/* ——— QUICK NAV: اتجاه التمرير (سلوك لاصق موحّد) + تفعيل الرابط النشط ——— */
(function () {
  'use strict';
  var html = document.documentElement, last = window.pageYOffset || 0, ticking = false;
  function onScroll() {
    var y = window.pageYOffset || 0;
    if (y < 8) html.classList.remove('stw-scroll-down');
    else if (y > last + 6) { html.classList.add('stw-scroll-down'); }
    else if (y < last - 6) { html.classList.remove('stw-scroll-down'); }
    last = y; ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });

  function markActive() {
    var cur = location.hash || '#/';
    var base = cur.split('?')[0];
    var view = (cur.split('view=')[1] || '').split('&')[0];
    Array.prototype.forEach.call(document.querySelectorAll('.shop-quicknav__link'), function (a) {
      var href = a.getAttribute('href') || '';
      var hb = href.split('?')[0];
      var hv = (href.split('view=')[1] || '').split('&')[0];
      var on = (href === cur) || (hb === base && hv === view);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', function () { setTimeout(markActive, 20); });
  document.addEventListener('DOMContentLoaded', markActive);
  markActive();
})();
