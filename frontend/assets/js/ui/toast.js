/**
 * alwled — نظام feedback موحّد (toasts).
 */
(function (global) {
  'use strict';

  var dom = () => global.ALW.dom;
  var stack = null;

  function container() {
    if (stack && document.body.contains(stack)) return stack;
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
    return stack;
  }

  function show(options) {
    var opts = typeof options === 'string' ? { text: options } : options || {};
    var type = opts.type || 'info';
    var icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    var titles = { success: 'تم بنجاح', error: 'تعذّر التنفيذ', warning: 'تنبيه', info: 'معلومة' };

    var node = document.createElement('div');
    node.className = 'toast toast--' + type;

    var iconWrap = document.createElement('span');
    iconWrap.className = 'toast__icon';
    iconWrap.appendChild(dom().icon(icons[type] || 'info', 'icon'));
    node.appendChild(iconWrap);

    var content = document.createElement('div');
    content.className = 'toast__content';
    var title = document.createElement('div');
    title.className = 'toast__title';
    title.textContent = opts.title || titles[type] || '';
    content.appendChild(title);
    if (opts.text) {
      var text = document.createElement('div');
      text.className = 'toast__text';
      text.textContent = opts.text;
      content.appendChild(text);
    }
    node.appendChild(content);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'إغلاق التنبيه');
    close.appendChild(dom().icon('x', 'icon icon--sm'));
    close.addEventListener('click', function () {
      dismiss(node);
    });
    node.appendChild(close);

    container().appendChild(node);
    var timeout = opts.duration === undefined ? (type === 'error' ? 6500 : 4200) : opts.duration;
    if (timeout > 0) setTimeout(function () { dismiss(node); }, timeout);
    return { close: function () { dismiss(node); } };
  }

  function dismiss(node) {
    if (!node || !node.parentNode) return;
    node.classList.add('is-leaving');
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 200);
  }

  function fromError(error, fallback) {
    var message = error && error.message ? error.message : fallback;
    if (error && error.code === 'forbidden') {
      return show({ type: 'warning', title: 'صلاحيات غير كافية', text: message });
    }
    if (error && error.code === 'validation' && error.fields && error.fields.length) {
      return show({ type: 'warning', title: 'تحقق من البيانات', text: error.fields.map(function (f) { return f.message; }).join(' · ') });
    }
    return show({ type: 'error', text: message || 'تعذر تنفيذ العملية، حاول مرة أخرى.' });
  }

  var api = { show: show, fromError: fromError, success: function (text, title) { return show({ type: 'success', text: text, title: title }); }, error: function (text, title) { return show({ type: 'error', text: text, title: title }); }, warning: function (text, title) { return show({ type: 'warning', text: text, title: title }); }, info: function (text, title) { return show({ type: 'info', text: text, title: title }); } };

  global.ALW = global.ALW || {};
  global.ALW.toast = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
