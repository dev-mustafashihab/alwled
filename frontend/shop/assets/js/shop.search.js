/**
 * shop.search.js — Stage 15.2 (المرحلة A)
 * بحث سريع للجوال: زر 🔍 في الهيدر يفتح لوحة بحث منسدلة من تحت الهيدر.
 * كل النداءات تمرّ من عميل الـAPI المركزي (ALW.api) — لا fetch مباشر، ولا endpoints جديدة.
 * اقتراحات حقيقية من بيانات المتجر (تصنيفات/علامات) — بلا أي بيانات وهمية.
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;
  var doc = global.document;

  var state = { open: false, lastFocus: null, timer: null, reqSeq: 0, suggestions: null, prevHtml: '', prevBody: '', lastQuery: '' };
  var DEBOUNCE_MS = 300;
  var MIN_CHARS = 1;

  function sheet() { return doc.getElementById('shop-search-sheet'); }
  function input() { return doc.getElementById('shop-search-sheet-input'); }
  function resultsBox() { return doc.getElementById('shop-search-results'); }
  function clearBtn() { return doc.getElementById('shop-search-clear'); }

  function el(tag, options, children) { return shop.el(tag, options, children); }

  var ICON_MAP = { bell: 'bell', cart: 'shopping-cart', user: 'user', logout: 'log-out', login: 'log-in', clipboard: 'clipboard-list', check: 'circle-check', box: 'package', history: 'clock', alert: 'circle-alert', search: 'search', x: 'x', grid: 'layout-grid', folder: 'folder', tag: 'tag', home: 'house', house: 'house', sun: 'sun', moon: 'moon', monitor: 'monitor', 'user-plus': 'user-plus' };

  function iconNode(name, size) {
    var key = ICON_MAP[name] || name;
    if (ALW.icons && ALW.icons.node) return ALW.icons.node(key, size || 20);
    return null;
  }

  function lockScroll(lock) {
    if (lock) {
      state.prevHtml = doc.documentElement.style.overflow;
      state.prevBody = doc.body.style.overflow;
      doc.documentElement.style.overflow = 'hidden';
      doc.body.style.overflow = 'hidden';
    } else {
      doc.documentElement.style.overflow = state.prevHtml || '';
      doc.body.style.overflow = state.prevBody || '';
    }
  }

  function money(value) {
    return shop.money ? shop.money(value) : String(value);
  }

  /* ------------------------------------------------ حالات العرض */
  function renderState(kind, title, text, actionLabel, actionFn) {
    var box = resultsBox();
    if (!box) return;
    shop.clear(box);
    var iconName = kind === 'error' ? 'alert' : 'box';
    box.appendChild(el('div', {
      class: 'shop-search-state',
      // إعلان قصير لقارئ الشاشة («لا نتائج» / خطأ) — نفس نمط عدّاد النتائج
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    }, [
      el('span', { class: 'shop-search-state__icon' }, [iconNode(iconName, 30)]),
      el('p', { class: 'shop-search-state__title', text: title }),
      text ? el('p', { class: 'shop-search-state__text', text: text }) : null,
      actionLabel ? el('button', { class: 'btn btn--primary', type: 'button', text: actionLabel, onclick: actionFn }) : null,
    ]));
  }

  function renderLoading() {
    var box = resultsBox();
    if (!box) return;
    shop.clear(box);
    box.appendChild(el('div', { class: 'shop-search-results', attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ البحث' } },
      [0, 1, 2].map(function () { return el('div', { class: 'shop-search-skeleton' }); })));
  }

  function renderResults(payload, query) {
    var box = resultsBox();
    if (!box) return;
    var items = (payload && payload.items) || [];
    var total = (payload && payload.meta && payload.meta.total) || items.length;
    shop.clear(box);

    if (!items.length) {
      renderState('empty', 'لا نتائج مطابقة', 'لم نجد منتجات تطابق «' + query + '». جرّب كلمة أخرى أو تصفّح كل المنتجات.',
        'تصفّح كل المنتجات', function () { goTo({ path: '/products' }); });
      return;
    }

    // إعلان لقارئ الشاشة: عنصر العدّاد فقط (نص قصير) — لا نضع aria-live على الحاوية كاملة
    box.appendChild(el('p', {
      class: 'shop-search-sheet__label',
      text: total > items.length ? 'نتائج (' + total + ') — الأكثر صلة' : 'نتائج (' + total + ')',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    }));
    box.appendChild(el('div', { class: 'shop-search-results' }, items.map(function (item) {
      var model = shop.productCardModel(item);
      var media = model.image
        ? shop.imageNode(model.image, model.name, '', true)
        : iconNode('box', 26);
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

  /* ------------------------------------------------ الاقتراحات (بيانات حقيقية) */
  function renderSuggestions() {
    var host = doc.getElementById('shop-search-suggest-list');
    if (!host) return;
    if (state.suggestions) { paint(state.suggestions); return; }
    host.innerHTML = '';
    host.appendChild(el('div', { class: 'shop-search-skeleton', attrs: { style: 'height:40px' } }));

    Promise.all([
      shop.api.categories().catch(function () { return { items: [] }; }),
      shop.api.brands().catch(function () { return { items: [] }; }),
    ]).then(function (res) {
      var cats = (res[0] && res[0].items) || [];
      var brands = (res[1] && res[1].items) || [];
      state.suggestions = { categories: cats.slice(0, 6), brands: brands.slice(0, 6) };
      paint(state.suggestions);
    }).catch(function () {
      host.innerHTML = '';
      host.appendChild(el('span', { class: 'shop-search-state__text', text: 'تعذّر تحميل الاقتراحات.' }));
    });
  }

  function paint(sug) {
    var host = doc.getElementById('shop-search-suggest-list');
    if (!host) return;
    shop.clear(host);
    var chips = [];
    sug.categories.forEach(function (c) {
      chips.push(chip(c.name, 'grid', function () { goTo({ path: '/products', query: { categoryId: c.id } }); }));
    });
    sug.brands.forEach(function (b) {
      chips.push(chip(b.name, 'history', function () { goTo({ path: '/products', query: { brandId: b.id } }); }));
    });
    chips.push(chip('كل المنتجات', 'box', function () { goTo({ path: '/products' }); }));
    host.appendChild(el('div', { class: 'shop-search-chips' }, chips));
  }

  function chip(label, iconName, onClick) {
    var node = el('button', { class: 'shop-search-chip', type: 'button' }, [
      iconNode(iconName, 16),
      el('span', { text: label }),
    ]);
    node.addEventListener('click', onClick);
    return node;
  }

  /* ------------------------------------------------ التنفيذ */
  function runSearch(rawQuery) {
    var query = String(rawQuery || '').trim();
    state.lastQuery = query;
    var clear = clearBtn();
    if (clear) clear.hidden = query.length === 0;

    var toggleSections = function (showResults) {
      var sug = doc.getElementById('shop-search-suggest');
      if (sug) sug.hidden = showResults;
    };

    if (query.length < MIN_CHARS) {
      toggleSections(false);
      renderSuggestions();
      shop.clear(resultsBox());
      return;
    }

    toggleSections(true);
    renderLoading();
    var seq = ++state.reqSeq;
    shop.api.products({ search: query, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' }).then(function (payload) {
      if (seq !== state.reqSeq) return;                 // نتيجة قديمة: تُهمل
      renderResults(payload, query);
    }).catch(function (error) {
      if (seq !== state.reqSeq) return;
      var message = (error && error.status === 0) ? 'تعذّر الاتصال بالخادم.' : 'تعذّر تحميل نتائج البحث.';
      renderState('error', 'حدث خطأ أثناء البحث', message, 'إعادة المحاولة', function () { runSearch(state.lastQuery); });
    });
  }

  function scheduleSearch(value) {
    global.clearTimeout(state.timer);
    state.timer = global.setTimeout(function () { runSearch(value); }, DEBOUNCE_MS);
  }

  function open() {
    var node = sheet();
    if (!node || state.open) return;
    // لوحة واحدة في الوقت: إغلاق القائمة الجانبية إن كانت مفتوحة
    if (ALW.shopHeader && ALW.shopHeader.isOpen && ALW.shopHeader.isOpen()) ALW.shopHeader.close(true);
    state.lastFocus = doc.activeElement;
    lockScroll(true);
    node.hidden = false;
    node.setAttribute('aria-hidden', 'false');
    state.open = true;

    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      node.classList.add('is-open');
    } else {
      node.classList.remove('is-open', 'is-closing');
      node.classList.add('is-opening');
      void node.offsetWidth;
      global.requestAnimationFrame(function () {
        if (!state.open) return;
        node.classList.remove('is-opening');
        node.classList.add('is-open');
      });
    }

    renderSuggestions();
    var field = input();
    if (field) {
      global.setTimeout(function () { field.focus({ preventScroll: true }); if (field.value) field.select(); }, 60);
    }
    doc.addEventListener('keydown', onKeydown, true);
  }

  function close(immediate) {
    var node = sheet();
    if (!node || !state.open) return;
    state.open = false;
    global.clearTimeout(state.timer);
    node.classList.remove('is-open', 'is-opening');
    node.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    doc.removeEventListener('keydown', onKeydown, true);
    var finish = function () {
      if (state.open) return;
      node.hidden = true;
      node.classList.remove('is-closing');
    };
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (immediate || reduce) { finish(); }
    else {
      node.classList.add('is-closing');
      global.setTimeout(finish, 240);
    }
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus({ preventScroll: true }); } catch (error) { /* عنصر أُزيل */ }
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }

  function currentValue() { return String((input() || {}).value || '').trim(); }

  function submit() {
    var query = currentValue();
    goTo(query ? { path: '/products', query: { search: query } } : { path: '/products' });
  }

  function init() {
    var node = sheet();
    if (!node) return;

    // زر البحث في الهيدر (جوال)
    doc.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('#shop-search-btn');
      if (btn) { event.preventDefault(); if (state.open) close(); else open(); }
    });

    var closeBtn = doc.getElementById('shop-search-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(); });

    var field = input();
    if (field) {
      field.addEventListener('input', function () { scheduleSearch(field.value); });
      field.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
      });
    }

    var clear = clearBtn();
    if (clear) {
      clear.addEventListener('click', function () {
        var f = input();
        if (f) { f.value = ''; f.focus(); }
        runSearch('');
      });
    }

    global.addEventListener('hashchange', function () { if (state.open) close(true); });
    global.addEventListener('resize', function () { if (state.open && global.innerWidth >= 1024) close(true); });
  }

  ALW.shopSearch = { init: init, open: open, close: close, isOpen: function () { return state.open; }, run: runSearch };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
