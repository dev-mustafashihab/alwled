/**
 * alwled — DOM helpers. لا innerHTML لبيانات المستخدم: كل النصوص تمر بـ esc()
 * أو تُبنى كعُقد نصية (textContent).
 */
(function (global) {
  'use strict';

  var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, function (ch) {
      return ESCAPE_MAP[ch];
    });
  }

  /** Only allow http/https/blob/data:image URLs to reach the DOM. */
  function safeUrl(url) {
    if (!url) return '';
    var value = String(url).trim();
    if (/^(https?:|blob:|data:image\/)/i.test(value)) return value;
    return '';
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value; // caller must pre-escape
        else if (key === 'dataset') {
          Object.keys(value).forEach(function (dataKey) {
            node.dataset[dataKey] = value[dataKey];
          });
        } else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, value);
        }
      });
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function clear(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function mount(node, children) {
    clear(node);
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (!child) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function on(node, eventName, selector, handler) {
    node.addEventListener(eventName, function (event) {
      var target = event.target.closest(selector);
      if (target && node.contains(target)) handler(event, target);
    });
    return function () {
      node.removeEventListener(eventName, handler);
    };
  }

  function icon(name, className) {
    var icons = global.ALW && global.ALW.icons;
    if (icons && typeof icons.svg === 'function') return icons.svg(name, className);
    return el('span', { class: className || 'icon' });
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, wait || 300);
    };
  }

  function copyText(text) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(String(text));
    }
    return Promise.reject(new Error('clipboard-unavailable'));
  }

  var api = { esc: esc, safeUrl: safeUrl, el: el, qs: qs, qsa: qsa, clear: clear, mount: mount, on: on, icon: icon, debounce: debounce, copyText: copyText };

  global.ALW = global.ALW || {};
  global.ALW.dom = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
