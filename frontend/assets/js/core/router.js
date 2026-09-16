/**
 * alwled — hash router مع حرّاس (session + permission).
 * المسارات مُعرَّفة في app.js؛ هنا المنطق فقط (قابل للاختبار بلا DOM).
 */
(function (global) {
  'use strict';

  function parseHash(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) raw = '/';
    var parts = raw.split('?');
    var path = parts[0] || '/';
    if (path.charAt(0) !== '/') path = '/' + path;
    if (path.length > 1) path = path.replace(/\/+$/, '');
    var query = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        var key = decodeURIComponent(kv[0] || '');
        if (!key) return;
        query[key] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
    }
    return { path: path, query: query };
  }

  function buildHash(path, query) {
    var base = '#' + (path || '/');
    var parts = [];
    Object.keys(query || {}).forEach(function (key) {
      var value = query[key];
      if (value === null || value === undefined || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? base + '?' + parts.join('&') : base;
  }

  /**
   * resolve(path) → { kind: 'route'|'login'|'forbidden'|'notfound', route }
   * Guards: unauthenticated → login; missing permission → forbidden.
   */
  function resolve(path, routes, context) {
    var route = routes[path];
    var authenticated = !!(context && context.authenticated);
    if (route && route.public) return { kind: 'route', route: route };
    if (!route) {
      if (path === '/' || path === '/login') return { kind: 'login', route: routes['/login'] || null };
      return { kind: 'notfound', route: null };
    }
    if (!authenticated) return { kind: 'login', route: route };
    if (route.permission && !(context.can && context.can(route.permission))) {
      return { kind: 'forbidden', route: route };
    }
    return { kind: 'route', route: route };
  }

  function createRouter(options) {
    var opts = options || {};
    var routes = opts.routes || {};
    var listeners = [];
    var current = null;

    function navigate(path, query) {
      var hash = buildHash(path, query);
      if (global.location && global.location.hash === hash) {
        dispatch();
        return;
      }
      if (global.location) global.location.hash = hash;
      else dispatch();
    }

    function dispatch() {
      var parsed = parseHash(global.location ? global.location.hash : '/');
      var context = typeof opts.context === 'function' ? opts.context() : opts.context || {};
      var result = resolve(parsed.path, routes, context);
      current = { path: parsed.path, query: parsed.query, result: result };
      listeners.slice().forEach(function (fn) {
        try {
          fn(current);
        } catch (error) {
          if (global.console && console.error) console.error(error);
        }
      });
      return current;
    }

    return {
      routes: routes,
      navigate: navigate,
      dispatch: dispatch,
      current: function () {
        return current;
      },
      onChange: function (fn) {
        listeners.push(fn);
        return function () {
          listeners = listeners.filter(function (item) {
            return item !== fn;
          });
        };
      },
      start: function () {
        if (global.addEventListener) global.addEventListener('hashchange', dispatch);
        return dispatch();
      },
    };
  }

  var api = {
    parseHash: parseHash,
    buildHash: buildHash,
    resolve: resolve,
    createRouter: createRouter,
  };

  global.ALW = global.ALW || {};
  global.ALW.router = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
