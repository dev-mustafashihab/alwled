/**
 * alwled — مسار المصادقة في الواجهة.
 * يعتمد على /auth/login · /auth/refresh · /auth/logout · /auth/logout-all · /auth/me
 * الرسائل لا تكشف سبب الفشل (لا user enumeration) — نعرض رسالة الخادم العامة.
 */
(function (global) {
  'use strict';

  var ALW = global.ALW || (global.ALW = {});
  var state = (ALW.store || { createStore: function () { return { get: function () { return {}; }, set: function () {} , subscribe: function () {} }; } }).createStore({
    status: 'anonymous', // anonymous | loading | authenticated
    user: null,
    permissions: null,
    lastError: null,
  });

  var deps = {
    api: null,
    session: null,
    permissionsFactory: null,
  };

  function configure(options) {
    Object.keys(options || {}).forEach(function (key) {
      if (options[key] !== undefined) deps[key] = options[key];
    });
    return deps;
  }

  function api() {
    return deps.api || ALW.api;
  }
  function session() {
    return deps.session || ALW.session;
  }
  function permsFactory() {
    return deps.permissionsFactory || ALW.permissions;
  }

  function apply(user) {
    var permissions = permsFactory().create(user && user.permissions, user && user.roles);
    state.set({ status: 'authenticated', user: user || null, permissions: permissions, lastError: null });
    if (session() && typeof session().setUser === 'function') session().setUser(user || null);
    return permissions;
  }

  function clear() {
    state.set({ status: 'anonymous', user: null, permissions: permsFactory().empty, lastError: null });
  }

  function loadMe() {
    return api()
      .get('/auth/me')
      .then(function (user) {
        return apply(user);
      });
  }

  function login(credentials) {
    state.set({ status: 'loading', lastError: null });
    return api()
      .post('/auth/login', {
        phone: credentials.identifier,
        password: credentials.password,
      }, { skipAuth: true })
      .then(function (data) {
        if (!data || !data.accessToken) throw api().ApiError('استجابة غير متوقعة من الخادم', { code: 'server' });
        session().start({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          remember: credentials.remember === true,
        });
        return loadMe();
      })
      .catch(function (error) {
        state.set({ status: 'anonymous', lastError: error.message });
        throw error;
      });
  }

  function refresh() {
    var refreshToken = session().getRefresh();
    if (!refreshToken) return Promise.resolve(false);
    return api()
      .post('/auth/refresh', { refreshToken: refreshToken }, { skipAuth: true, _attempt: 1 })
      .then(function (data) {
        if (!data || !data.accessToken) return false;
        session().start({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          remember: session().isRemembered(),
        });
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function logout(allSessions) {
    var path = allSessions ? '/auth/logout-all' : '/auth/logout';
    var body = allSessions ? {} : { refreshToken: session().getRefresh() };
    return api()
      .post(path, body)
      .catch(function () {
        /* even if the server call fails, the local session must end */
      })
      .then(function () {
        session().clear();
        clear();
      });
  }

  /** Restores a session after a page reload: refresh (if needed) then /auth/me. */
  function restore() {
    if (!session().hasRefresh()) {
      clear();
      return Promise.resolve(false);
    }
    state.set({ status: 'loading' });
    var ensureAccess = session().getAccess() ? Promise.resolve(true) : refresh();
    return ensureAccess.then(function (ok) {
      if (!ok) {
        session().clear();
        clear();
        return false;
      }
      return loadMe()
        .then(function () {
          return true;
        })
        .catch(function () {
          session().clear();
          clear();
          return false;
        });
    });
  }

  var auth = {
    state: state,
    configure: configure,
    login: login,
    logout: logout,
    refresh: refresh,
    restore: restore,
    loadMe: loadMe,
    clear: clear,
    apply: apply,
    user: function () {
      return state.get().user;
    },
    permissions: function () {
      return state.get().permissions || permsFactory().empty;
    },
    isAuthenticated: function () {
      return state.get().status === 'authenticated';
    },
    can: function (permission) {
      return auth.permissions().has(permission);
    },
    canAny: function (permissions) {
      return auth.permissions().hasAny(permissions);
    },
  };

  ALW.auth = auth;
  if (typeof module !== 'undefined' && module.exports) module.exports = auth;
})(typeof window !== 'undefined' ? window : globalThis);
