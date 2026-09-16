/**
 * alwled — runtime configuration.
 * لا يحتوي أي سرّ: عنوان الـAPI فقط، ويمكن تغييره من الإعدادات أو من localStorage.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'alwled.settings';

  function defaultApiBase() {
    // same-origin by default; when the panel is served from a sub-path (e.g. /alwled/)
    // the API defaults to the sibling "<dir>-api/api/v1" (matching the deployment convention).
    if (!global.location) return '/api/v1';
    var path = String(global.location.pathname || '/');
    var match = path.match(/^(.*\/)(?:index\.html)?$/);
    var dir = match ? match[1] : '/';
    if (!dir || dir === '/') return '/api/v1';
    return dir.replace(/\/+$/, '') + '-api/api/v1';
  }

  var DEFAULTS = {
    // نفس الأصل افتراضيًا (مثالي عند تقديم الواجهة من الخادم عبر reverse proxy).
    apiBaseUrl: defaultApiBase(),
    apiVersionPath: '',
    requestTimeoutMs: 20000,
    defaultPageSize: 20,
    pageSizes: [10, 20, 50],
    locale: 'ar',
    currencyFallback: 'USD',
    appName: 'الوليد',
    appNameFull: 'الوليد للأجهزة الكهربائية',
    appTagline: 'لوحة إدارة المتجر',
    supportPhone: '',
  };

  function storage() {
    try {
      return global.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function readOverrides() {
    var store = storage();
    if (!store) return {};
    try {
      var raw = store.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  var overrides = readOverrides();
  var config = {};

  Object.keys(DEFAULTS).forEach(function (key) {
    config[key] = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : DEFAULTS[key];
  });

  // Allow a build/deployment override through the page (e.g. <body data-api-base="...">)
  // or through the URL (?api=/api/v1) — useful when the panel is served from another origin.
  config.applyDocumentOverrides = function (doc, search) {
    if (doc && doc.body) {
      var attr = doc.body.getAttribute('data-api-base');
      if (attr) config.apiBaseUrl = attr;
    }
    var queryString = search !== undefined ? search : (global.location ? global.location.search : '');
    if (queryString) {
      var params = {};
      String(queryString)
        .replace(/^\?/, '')
        .split('&')
        .forEach(function (pair) {
          if (!pair) return;
          var kv = pair.split('=');
          if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
        });
      if (params.api) config.apiBaseUrl = params.api;
      if (params.apiBase) config.apiBaseUrl = params.apiBase;
    }
    return config;
  };

  config.saveOverrides = function (partial) {
    var store = storage();
    var next = Object.assign(readOverrides(), partial || {});
    Object.keys(next).forEach(function (key) {
      config[key] = next[key];
    });
    if (store) {
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        /* storage full/blocked — runtime config still applies */
      }
    }
    return config;
  };

  config.reset = function () {
    var store = storage();
    if (store) {
      try {
        store.removeItem(STORAGE_KEY);
      } catch (error) {
        /* ignore */
      }
    }
    Object.keys(DEFAULTS).forEach(function (key) {
      config[key] = DEFAULTS[key];
    });
    return config;
  };

  config.apiUrl = function (path) {
    var base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
    var suffix = String(path || '');
    if (suffix.charAt(0) !== '/') suffix = '/' + suffix;
    return base + suffix;
  };

  config.DEFAULTS = DEFAULTS;
  config.STORAGE_KEY = STORAGE_KEY;

  global.ALW = global.ALW || {};
  global.ALW.config = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
