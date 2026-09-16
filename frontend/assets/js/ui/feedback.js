/**
 * alwled — حالات الواجهة: skeleton, empty state, error state, inline loader.
 * لا شاشة فارغة: كل قائمة/بطاقة لها تحميل ثم نتيجة أو خطأ أو "لا بيانات".
 */
(function (global) {
  'use strict';

  function dom() {
    return global.ALW.dom;
  }

  function skeletonRows(count, height) {
    var wrap = document.createElement('div');
    wrap.className = 'stack--sm';
    for (var i = 0; i < (count || 6); i += 1) {
      var row = document.createElement('div');
      row.className = 'skeleton skeleton--row';
      if (height) row.style.height = height;
      wrap.appendChild(row);
    }
    return wrap;
  }

  function skeletonCards(count) {
    var wrap = document.createElement('div');
    wrap.className = 'kpi-grid';
    for (var i = 0; i < (count || 4); i += 1) {
      var card = document.createElement('div');
      card.className = 'skeleton skeleton--card';
      wrap.appendChild(card);
    }
    return wrap;
  }

  function skeletonTable(rows, columns) {
    var wrap = document.createElement('div');
    wrap.className = 'card';
    var head = document.createElement('div');
    head.className = 'card__head';
    var title = document.createElement('div');
    title.className = 'skeleton skeleton--title';
    title.style.margin = '0';
    head.appendChild(title);
    wrap.appendChild(head);
    var body = document.createElement('div');
    body.className = 'card__body';
    var line = document.createElement('div');
    line.className = 'skeleton skeleton--row';
    line.style.height = '34px';
    body.appendChild(line);
    body.appendChild(skeletonRows(rows || 6, '30px'));
    if (columns) body.style.minHeight = String(columns * 8) + 'px';
    wrap.appendChild(body);
    return wrap;
  }

  function state(config) {
    var opts = config || {};
    var wrap = document.createElement('div');
    wrap.className = 'state' + (opts.compact ? ' state--compact' : '') + (opts.tone === 'error' ? ' state--error' : '');

    var iconBox = document.createElement('div');
    iconBox.className = 'state__icon';
    iconBox.appendChild(dom().icon(opts.icon || 'inbox', 'icon icon--xl'));
    wrap.appendChild(iconBox);

    var title = document.createElement('div');
    title.className = 'state__title';
    title.textContent = opts.title || '';
    wrap.appendChild(title);

    if (opts.text) {
      var text = document.createElement('div');
      text.className = 'state__text';
      text.textContent = opts.text;
      wrap.appendChild(text);
    }

    if (opts.action) {
      var actions = document.createElement('div');
      actions.className = 'btn-group';
      actions.appendChild(opts.action);
      wrap.appendChild(actions);
    }
    return wrap;
  }

  function empty(text, title) {
    return state({ icon: 'inbox', title: title || 'لا توجد بيانات', text: text || 'لم يُعثر على عناصر مطابقة.' });
  }

  function errorState(error, retry) {
    var message = error && error.message ? error.message : 'تعذّر تحميل البيانات.';
    var hint = '';
    if (error && error.code === 'network') hint = 'تحقق من تشغيل الخادم ثم أعد المحاولة.';
    if (error && error.code === 'forbidden') hint = 'لا تملك صلاحية عرض هذا القسم.';
    var action = null;
    if (retry) {
      action = document.createElement('button');
      action.type = 'button';
      action.className = 'btn btn--secondary';
      action.appendChild(dom().icon('refresh', 'icon'));
      var label = document.createElement('span');
      label.textContent = 'إعادة المحاولة';
      action.appendChild(label);
      action.addEventListener('click', retry);
    }
    return state({
      tone: 'error',
      icon: error && error.code === 'forbidden' ? 'lock' : 'alert-triangle',
      title: 'تعذّر تحميل البيانات',
      text: hint ? message + ' — ' + hint : message,
      action: action,
    });
  }

  function inlineLoader(text) {
    var wrap = document.createElement('div');
    wrap.className = 'inline-loader';
    var spinner = document.createElement('span');
    spinner.className = 'spinner spinner--sm';
    wrap.appendChild(spinner);
    var label = document.createElement('span');
    label.textContent = text || 'جارٍ التحميل…';
    wrap.appendChild(label);
    return wrap;
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.label) button.dataset.label = button.textContent;
      button.disabled = true;
      button.innerHTML = '';
      var spinner = document.createElement('span');
      spinner.className = 'btn__spinner';
      button.appendChild(spinner);
      var label = document.createElement('span');
      label.textContent = button.dataset.busyLabel || 'جارٍ التنفيذ…';
      button.appendChild(label);
    } else {
      button.disabled = false;
      if (button.dataset.label) {
        button.textContent = button.dataset.label;
        delete button.dataset.label;
      }
    }
  }

  var api = { skeletonRows: skeletonRows, skeletonCards: skeletonCards, skeletonTable: skeletonTable, state: state, empty: empty, errorState: errorState, inlineLoader: inlineLoader, setButtonBusy: setButtonBusy };

  global.ALW = global.ALW || {};
  global.ALW.feedback = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
