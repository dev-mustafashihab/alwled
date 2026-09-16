/**
 * alwled — session/token storage.
 * - access token: في الذاكرة فقط (لا يُخزَّن على القرص ⇒ عمره عمر الصفحة).
 * - refresh token: في localStorage لأن الجلسة يجب أن تصمد بعد إعادة التحميل.
 * ملاحظة أمنية: أي تخزين في المتصفح معرّض لـXSS؛ لذلك لا نخزّن أي سرّ آخر،
 * وكل الأذونات تُفرض من الخادم. (التوثيق: docs/frontend.md)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'alwled.session';
  var memoryAccess = null;
  var listeners = [];

  function storage() {
    try {
      return global.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function readStored() {
    var store = storage();
    if (!store) return null;
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeStored(value) {
    var store = storage();
    if (!store) return;
    try {
      if (value) store.setItem(STORAGE_KEY, JSON.stringify(value));
      else store.removeItem(STORAGE_KEY);
    } catch (error) {
      /* storage unavailable (private mode) — session then lives in memory only */
    }
  }

  function emit(event) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(event);
      } catch (error) {
        /* a listener must never break session handling */
      }
    });
  }

  var api = {
    /** Called after a successful login/refresh. */
    start: function (payload) {
      memoryAccess = payload.accessToken || null;
      writeStored({
        refreshToken: payload.refreshToken || null,
        expiresIn: payload.expiresIn || null,
        remember: payload.remember === true,
        startedAt: new Date().toISOString(),
      });
      emit('started');
      return memoryAccess;
    },
    getAccess: function () {
      return memoryAccess;
    },
    getRefresh: function () {
      var stored = readStored();
      return stored ? stored.refreshToken : null;
    },
    isRemembered: function () {
      var stored = readStored();
      return !!(stored && stored.remember);
    },
    hasRefresh: function () {
      return !!api.getRefresh();
    },
    /** In-memory proof that we have an authenticated user cached for this tab. */
    isActive: function () {
      return !!memoryAccess || api.hasRefresh();
    },
    user: function () {
      var stored = readStored();
      return stored && stored.user ? stored.user : null;
    },
    setUser: function (user) {
      var stored = readStored() || {};
      stored.user = user || null;
      writeStored(stored);
    },
    clear: function () {
      memoryAccess = null;
      writeStored(null);
      emit('cleared');
    },
    expire: function () {
      memoryAccess = null;
      writeStored(null);
      emit('expired');
    },
    on: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (item) {
          return item !== fn;
        });
      };
    },
    STORAGE_KEY: STORAGE_KEY,
    _resetForTests: function () {
      memoryAccess = null;
      listeners = [];
    },
  };

  global.ALW = global.ALW || {};
  global.ALW.session = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
