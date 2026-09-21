/**
 * shop.search.js — PHASE 2.3
 * Search Morph + Opaque Drop Curtain (mobile only).
 * Uses only the existing ALW.shop API client; no fetch/endpoints/mock data.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var doc = global.document;
  var DEBOUNCE_MS = 300;
  var MIN_CHARS = 1;
  var ANIMATION_MS = 260;

  var state = {
    open: false,
    closing: false,
    generation: 0,
    closeTimer: null,
    timer: null,
    reqSeq: 0,
    suggestions: null,
    lastFocus: null,
    scrollY: 0,
    prevHtml: '',
    prevBody: '',
    prevHeaderStyle: null,
    lastQuery: '',
    inertNodes: [],
  };

  /* ---------------------------------------------------------------- refs */
  function sheet() { return doc.getElementById('shop-search-sheet'); }
  function curtain() { return doc.getElementById('shop-search-curt'); }
  function morph() { return doc.getElementById('shop-search-morph'); }
  function field() { return doc.getElementById('shop-search-morph-field'); }
  function input() { return doc.getElementById('shop-search-morph-input'); }
  function closeButton() { return doc.getElementById('shop-search-morph-close'); }
  function clearButton() { return doc.getElementById('shop-search-clear'); }
  function resultsBox() { return doc.getElementById('shop-search-results'); }
  function quicknav() { return doc.getElementById('shop-quicknav'); }
  function trigger() { return doc.getElementById('shop-search-btn'); }
  function header() { return doc.getElementById('shop-header'); }
  function headerRow() { return doc.querySelector('.shop-header__inner'); }
  function el(tag, options, children) { return shop.el(tag, options, children); }

  var ICON_MAP = {
    alert: 'circle-alert', box: 'package', grid: 'layout-grid', history: 'clock',
  };
  function iconNode(name, size) {
    var key = ICON_MAP[name] || name;
    return ALW.icons && ALW.icons.node ? ALW.icons.node(key, size || 20) : null;
  }

  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function lockScroll(lock) {
    if (lock) {
      state.prevHtml = doc.documentElement.style.overflow;
      state.prevBody = doc.body.style.overflow;
      doc.documentElement.style.overflow = 'hidden';
      doc.body.style.overflow = 'hidden';
      return;
    }
    doc.documentElement.style.overflow = state.prevHtml || '';
    doc.body.style.overflow = state.prevBody || '';
    state.prevHtml = '';
    state.prevBody = '';
  }

  function pinHeader(pin) {
    var h = header();
    if (!h) return;
    if (pin) {
      state.prevHeaderStyle = {
        position: h.style.position, top: h.style.top, left: h.style.left,
        right: h.style.right, width: h.style.width, insetInline: h.style.insetInline,
      };
      h.style.position = 'fixed';
      h.style.top = '0';
      h.style.left = '0';
      h.style.right = '0';
      h.style.width = '100%';
      h.style.insetInline = '0';
      return;
    }
    if (!state.prevHeaderStyle) return;
    h.style.position = state.prevHeaderStyle.position;
    h.style.top = state.prevHeaderStyle.top;
    h.style.left = state.prevHeaderStyle.left;
    h.style.right = state.prevHeaderStyle.right;
    h.style.width = state.prevHeaderStyle.width;
    h.style.insetInline = state.prevHeaderStyle.insetInline;
    state.prevHeaderStyle = null;
  }

  function setInert(lock) {
    var nodes = [doc.getElementById('shop-main'), doc.querySelector('.shop-footer')].filter(Boolean);
    if (lock) {
      state.inertNodes = nodes.map(function (node) {
        return { node: node, inert: !!node.inert, aria: node.getAttribute('aria-hidden') };
      });
      state.inertNodes.forEach(function (entry) {
        entry.node.inert = true;
        entry.node.setAttribute('aria-hidden', 'true');
      });
      return;
    }
    state.inertNodes.forEach(function (entry) {
      entry.node.inert = entry.inert;
      if (entry.aria === null) entry.node.removeAttribute('aria-hidden');
      else entry.node.setAttribute('aria-hidden', entry.aria);
    });
    state.inertNodes = [];
  }

  function setHeaderSearchActive(active) {
    var h = header();
    var nav = quicknav();
    var btn = trigger();
    if (h) {
      if (active) h.setAttribute('data-search-active', 'true');
      else h.removeAttribute('data-search-active');
    }
    if (nav) {
      if (active) nav.setAttribute('aria-hidden', 'true');
      else nav.removeAttribute('aria-hidden');
    }
    if (btn) {
      btn.inert = !!active;
      if (active) btn.setAttribute('aria-hidden', 'true');
      else btn.removeAttribute('aria-hidden');
    }
  }

  /* -------------------------------------------------------------- geometry */
  function measureGeometry() {
    var btn = trigger();
    var row = headerRow();
    if (!btn || !row) return null;
    var b = btn.getBoundingClientRect();
    var r = row.getBoundingClientRect();
    var rowStyle = global.getComputedStyle(row);
    var outerLeft = parseFloat(rowStyle.paddingLeft) || 0;
    var outerRight = parseFloat(rowStyle.paddingRight) || 0;
    var closeSize = 44;
    var closeSlot = closeSize + 8;
    var fieldHeight = Math.min(48, Math.max(44, r.height - 8));
    return {
      trigger: { left: b.left, top: b.top, width: b.width, height: b.height },
      field: {
        left: r.left + outerLeft + closeSlot,
        top: r.top + (r.height - fieldHeight) / 2,
        width: r.width - outerLeft - outerRight - closeSlot,
        height: fieldHeight,
      },
      close: {
        left: r.left + outerLeft,
        top: r.top + (r.height - closeSize) / 2,
        width: closeSize,
        height: closeSize,
      },
      row: { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom },
    };
  }

  function applyGeometry(geometry, destination) {
    if (!geometry) return;
    var g = destination === 'field' ? geometry.field : geometry.trigger;
    doc.body.style.setProperty('--search-field-left', g.left + 'px');
    doc.body.style.setProperty('--search-field-top', g.top + 'px');
    doc.body.style.setProperty('--search-field-width', g.width + 'px');
    doc.body.style.setProperty('--search-field-height', g.height + 'px');
    doc.body.style.setProperty('--search-close-left', geometry.close.left + 'px');
    doc.body.style.setProperty('--search-close-top', geometry.close.top + 'px');
    doc.body.style.setProperty('--search-close-width', geometry.close.width + 'px');
    doc.body.style.setProperty('--search-close-height', geometry.close.height + 'px');
    doc.body.style.setProperty('--search-row-bottom', geometry.row.bottom + 'px');
  }

  function clearGeometry() {
    ['--search-field-left', '--search-field-top', '--search-field-width',
      '--search-field-height', '--search-close-left', '--search-close-top',
      '--search-close-width', '--search-close-height', '--search-row-bottom'].forEach(function (key) {
      doc.body.style.removeProperty(key);
    });
  }

  /* ------------------------------------------------------------ rendering */
  function money(value) { return shop.money ? shop.money(value) : String(value); }

  function renderState(kind, title, text, actionLabel, actionFn) {
    var box = resultsBox();
    if (!box) return;
    shop.clear(box);
    box.appendChild(el('div', {
      class: 'shop-search-state',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    }, [
      el('span', { class: 'shop-search-state__icon' }, [iconNode(kind === 'error' ? 'alert' : 'box', 30)]),
      el('p', { class: 'shop-search-state__title', text: title }),
      text ? el('p', { class: 'shop-search-state__text', text: text }) : null,
      actionLabel ? el('button', { class: 'btn btn--primary', type: 'button', text: actionLabel, onclick: actionFn }) : null,
    ]));
  }

  function renderLoading() {
    var box = resultsBox();
    if (!box) return;
    shop.clear(box);
    box.appendChild(el('div', {
      class: 'shop-search-results',
      attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ البحث' },
    }, [0, 1, 2].map(function () { return el('div', { class: 'shop-search-skeleton' }); })));
  }

  function renderResults(payload, query) {
    var box = resultsBox();
    if (!box) return;
    var items = (payload && payload.items) || [];
    var total = (payload && payload.meta && payload.meta.total) || items.length;
    shop.clear(box);
    if (!items.length) {
      renderState('empty', 'لا نتائج مطابقة', 'لم نجد منتجات تطابق «' + query + '». جرّب كلمة أخرى.',
        'تصفّح كل المنتجات', function () { goTo({ path: '/products' }); });
      return;
    }
    box.appendChild(el('p', {
      class: 'shop-search-sheet__label',
      text: total > items.length ? 'نتائج (' + total + ') — الأكثر صلة' : 'نتائج (' + total + ')',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    }));
    box.appendChild(el('div', { class: 'shop-search-results' }, items.map(function (item) {
      var model = shop.productCardModel(item);
      var media = model.image ? shop.imageNode(model.image, model.name, '', true) : iconNode('box', 26);
      return el('a', {
        class: 'shop-search-row', href: model.href,
        attrs: { role: 'option', 'data-product-id': String(model.id) },
        onclick: function () { close(true); },
      }, [
        el('span', { class: 'shop-search-row__media' }, [media]),
        el('span', { class: 'shop-search-row__main' }, [
          el('span', { class: 'shop-search-row__name', text: model.name }),
          el('span', { class: 'shop-search-row__meta', text: [model.brand, model.category].filter(Boolean).join(' · ') || 'منتج' }),
        ]),
        el('span', { class: 'shop-search-row__price', text: money(model.price) }),
      ]);
    })));
  }

  function goTo(target) {
    var hash = shop.buildHash(target);
    close(true);
    if (global.location.hash !== hash) global.location.hash = hash;
  }

  /* -------------------------------------------------------- real suggestions */
  function chip(label, iconName, onClick) {
    var node = el('button', { class: 'shop-search-chip', type: 'button' }, [
      iconNode(iconName, 16), el('span', { text: label }),
    ]);
    node.addEventListener('click', onClick);
    return node;
  }

  function paintSuggestions(data) {
    var host = doc.getElementById('shop-search-suggest-list');
    if (!host) return;
    shop.clear(host);
    var chips = [];
    data.categories.forEach(function (category) {
      chips.push(chip(category.name, 'grid', function () {
        goTo({ path: '/products', query: { categoryId: category.id } });
      }));
    });
    data.brands.forEach(function (brand) {
      chips.push(chip(brand.name, 'history', function () {
        goTo({ path: '/products', query: { brandId: brand.id } });
      }));
    });
    host.appendChild(el('div', { class: 'shop-search-chips' }, chips));
  }

  function renderSuggestions() {
    var host = doc.getElementById('shop-search-suggest-list');
    if (!host) return;
    if (state.suggestions) { paintSuggestions(state.suggestions); return; }
    shop.clear(host);
    host.appendChild(el('div', { class: 'shop-search-skeleton', attrs: { style: 'height:44px' } }));
    Promise.all([
      shop.api.categories().catch(function () { return { items: [] }; }),
      shop.api.brands().catch(function () { return { items: [] }; }),
    ]).then(function (response) {
      state.suggestions = {
        categories: ((response[0] && response[0].items) || []).slice(0, 6),
        brands: ((response[1] && response[1].items) || []).slice(0, 4),
      };
      paintSuggestions(state.suggestions);
    }).catch(function () {
      shop.clear(host);
      host.appendChild(el('span', { class: 'shop-search-state__text', text: 'تعذّر تحميل الاقتراحات.' }));
    });
  }

  function runSearch(rawQuery) {
    var query = String(rawQuery || '').trim();
    state.lastQuery = query;
    var clear = clearButton();
    if (clear) clear.hidden = query.length === 0;
    var suggestionSection = doc.getElementById('shop-search-suggest');
    if (query.length < MIN_CHARS) {
      if (suggestionSection) suggestionSection.hidden = false;
      renderSuggestions();
      shop.clear(resultsBox());
      return;
    }
    if (suggestionSection) suggestionSection.hidden = true;
    renderLoading();
    var seq = ++state.reqSeq;
    shop.api.products({ search: query, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' }).then(function (payload) {
      if (seq !== state.reqSeq || !state.open) return;
      renderResults(payload, query);
    }).catch(function (error) {
      if (seq !== state.reqSeq || !state.open) return;
      var text = error && error.status === 0 ? 'تعذّر الاتصال بالخادم.' : 'تعذّر تحميل نتائج البحث.';
      renderState('error', 'حدث خطأ أثناء البحث', text,
        'إعادة المحاولة', function () { runSearch(state.lastQuery); });
    });
  }

  function scheduleSearch(value) {
    global.clearTimeout(state.timer);
    state.timer = global.setTimeout(function () { runSearch(value); }, DEBOUNCE_MS);
  }

  /* ------------------------------------------------------ modal state machine */
  function showNodes() {
    [curtain(), morph(), sheet()].forEach(function (node) {
      if (!node) return;
      node.hidden = false;
      node.setAttribute('aria-hidden', 'false');
    });
  }

  function hideNodes() {
    [curtain(), morph(), sheet()].forEach(function (node) {
      if (!node) return;
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
      node.classList.remove('is-open', 'is-closing', 'is-results-open', 'is-results-closing');
    });
    var f = field();
    var x = closeButton();
    if (f) f.classList.remove('is-open', 'is-closing');
    if (x) x.classList.remove('is-open', 'is-closing');
  }

  function finishClose(generation) {
    if (generation !== state.generation || !state.closing) return;
    state.closeTimer = null;
    state.closing = false;
    hideNodes();
    setHeaderSearchActive(false);
    setInert(false);
    lockScroll(false);
    pinHeader(false);
    clearGeometry();
    doc.removeEventListener('keydown', onKeydown, true);
    global.scrollTo(0, state.scrollY);
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus({ preventScroll: true }); } catch (error) { /* trigger removed */ }
    }
    state.lastFocus = null;
  }

  function open() {
    if (global.innerWidth >= 1024 || state.open) return;
    if (state.closeTimer) {
      global.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }
    state.generation += 1;
    state.closing = false;
    if (ALW.shopHeader && ALW.shopHeader.isOpen && ALW.shopHeader.isOpen()) ALW.shopHeader.close(true);

    var geometry = measureGeometry();
    if (!geometry) return;
    state.open = true;
    state.lastFocus = doc.activeElement;
    state.scrollY = global.scrollY;
    pinHeader(true);
    lockScroll(true);
    setInert(true);
    setHeaderSearchActive(true);
    showNodes();
    applyGeometry(geometry, 'trigger');

    var f = field();
    var x = closeButton();
    var c = curtain();
    var s = sheet();
    if (f) f.classList.remove('is-open', 'is-closing');
    if (x) x.classList.remove('is-open', 'is-closing');
    if (c) c.classList.remove('is-open', 'is-closing');
    if (s) s.classList.remove('is-results-open', 'is-results-closing');
    if (f) void f.offsetWidth; // stage trigger rect before first animated frame

    var generation = state.generation;
    var reveal = function () {
      if (generation !== state.generation || !state.open) return;
      applyGeometry(geometry, 'field');
      if (f) f.classList.add('is-open');
      if (x) x.classList.add('is-open');
      if (c) c.classList.add('is-open');
      if (s) s.classList.add('is-results-open');
      var searchInput = input();
      if (searchInput) {
        searchInput.focus({ preventScroll: true });
        if (searchInput.value) searchInput.select();
      }
    };
    if (reducedMotion()) reveal();
    else global.requestAnimationFrame(reveal);

    renderSuggestions();
    runSearch((input() || {}).value || '');
    doc.addEventListener('keydown', onKeydown, true);
  }

  function close(immediate) {
    if (!state.open || state.closing) return;
    state.open = false;
    state.closing = true;
    state.generation += 1;
    var generation = state.generation;
    global.clearTimeout(state.timer);
    state.reqSeq += 1;

    var geometry = measureGeometry();
    if (geometry) applyGeometry(geometry, 'trigger');
    var f = field();
    var x = closeButton();
    var c = curtain();
    var s = sheet();
    if (f) { f.classList.remove('is-open'); f.classList.add('is-closing'); }
    if (x) { x.classList.remove('is-open'); x.classList.add('is-closing'); }
    if (c) { c.classList.remove('is-open'); c.classList.add('is-closing'); }
    if (s) { s.classList.remove('is-results-open'); s.classList.add('is-results-closing'); }

    if (immediate || reducedMotion()) finishClose(generation);
    else state.closeTimer = global.setTimeout(function () { finishClose(generation); }, ANIMATION_MS);
  }

  function focusables() {
    var roots = [morph(), sheet()].filter(Boolean);
    var all = [];
    roots.forEach(function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('a[href], button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])'), function (node) {
        if (node.offsetParent !== null) all.push(node);
      });
    });
    return all;
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = doc.activeElement;
    if (event.shiftKey && (active === first || !items.includes(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !items.includes(active))) {
      event.preventDefault(); first.focus();
    }
  }

  function submit() {
    var query = String((input() || {}).value || '').trim();
    goTo(query ? { path: '/products', query: { search: query } } : { path: '/products' });
  }

  function init() {
    if (!sheet() || !trigger()) return;
    doc.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('#shop-search-btn');
      if (btn) { event.preventDefault(); open(); }
    });
    var closeBtn = closeButton();
    if (closeBtn) closeBtn.addEventListener('click', function (event) { event.preventDefault(); close(); });
    var curtainNode = curtain();
    if (curtainNode) curtainNode.addEventListener('click', function (event) {
      if (event.target === curtainNode) close();
    });
    var searchInput = input();
    if (searchInput) {
      searchInput.addEventListener('input', function () { scheduleSearch(searchInput.value); });
      searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
      });
    }
    var clear = clearButton();
    if (clear) clear.addEventListener('click', function () {
      var search = input();
      if (search) { search.value = ''; search.focus(); }
      runSearch('');
    });
    global.addEventListener('hashchange', function () { if (state.open) close(true); });
    global.addEventListener('resize', function () {
      if (!state.open) return;
      if (global.innerWidth >= 1024) { close(true); return; }
      var geometry = measureGeometry();
      if (geometry) applyGeometry(geometry, 'field');
    });
    if (global.visualViewport) global.visualViewport.addEventListener('resize', function () {
      if (!state.open) return;
      var geometry = measureGeometry();
      if (geometry) applyGeometry(geometry, 'field');
    });
  }

  ALW.shopSearch = { init: init, open: open, close: close, isOpen: function () { return state.open; }, run: runSearch };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
