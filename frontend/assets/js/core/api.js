/**
 * alwled — مركزي API client.
 * كل نداء للـBackend يمرّ من هنا: توحيد المصادقة، الأخطاء، وإعادة المحاولة بعد refresh.
 * لا fetch عشوائي داخل الصفحات.
 */
(function (global) {
  'use strict';

  var ERROR_MESSAGES = {
    network: 'تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة.',
    timeout: 'انتهت مهلة الطلب. أعد المحاولة.',
    unauthorized: 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.',
    forbidden: 'لا تملك صلاحية تنفيذ هذه العملية.',
    not_found: 'العنصر المطلوب غير موجود.',
    conflict: 'لا يمكن تنفيذ العملية بسبب تعارض في البيانات.',
    validation: 'تحقق من الحقول المُدخلة.',
    throttled: 'عدد الطلبات كبير. انتظر قليلاً ثم أعد المحاولة.',
    server: 'حدث خطأ في الخادم. حاول مرة أخرى.',
    offline: 'الخادم غير متاح حالياً.',
  };

  function ApiError(message, options) {
    var error = new Error(message || ERROR_MESSAGES.server);
    error.name = 'ApiError';
    error.status = (options && options.status) || 0;
    error.code = (options && options.code) || 'error';
    error.fields = (options && options.fields) || [];
    error.details = (options && options.details) || null;
    error.isApiError = true;
    return error;
  }

  function codeForStatus(status) {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 409) return 'conflict';
    if (status === 429) return 'throttled';
    if (status === 400 || status === 422) return 'validation';
    if (status >= 500) return 'server';
    return 'error';
  }

  function buildQuery(query) {
    if (!query) return '';
    var parts = [];
    Object.keys(query).forEach(function (key) {
      var value = query[key];
      if (value === null || value === undefined || value === '') return;
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (item !== null && item !== undefined && item !== '') {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item));
          }
        });
        return;
      }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function extractFields(body) {
    if (!body || !Array.isArray(body.errors)) return [];
    return body.errors.map(function (item) {
      if (typeof item === 'string') return { field: null, message: item };
      return { field: item.field || null, message: item.message || '' };
    });
  }

  var deps = {
    fetchImpl: typeof global.fetch === 'function' ? global.fetch.bind(global) : null,
    config: null,
    session: null,
    // a function returning a promise with a fresh access token, or null when it fails
    refresh: null,
    timeoutMs: 20000,
    onUnauthorized: null,
  };

  function configure(options) {
    Object.keys(options || {}).forEach(function (key) {
      if (options[key] !== undefined) deps[key] = options[key];
    });
    return deps;
  }

  function currentConfig() {
    return deps.config || (global.ALW && global.ALW.config) || { apiUrl: function (p) { return p; }, requestTimeoutMs: 20000 };
  }

  function currentSession() {
    return deps.session || (global.ALW && global.ALW.session) || null;
  }

  // تجديد واحد فقط عند تزامن عدة 401 (بدل عدة نداءات refresh متوازية تُبطل بعضها)
  var refreshInFlight = null;

  function sharedRefresh() {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve(deps.refresh())
        .then(function (result) {
          refreshInFlight = null;
          return result;
        })
        .catch(function (error) {
          refreshInFlight = null;
          throw error;
        });
    }
    return refreshInFlight;
  }

  function request(method, path, options) {
    var opts = options || {};
    var settings = currentConfig();
    var url = settings.apiUrl ? settings.apiUrl(path) : path;
    url += buildQuery(opts.query);
    var session = currentSession();
    var timeout = opts.timeoutMs || settings.requestTimeoutMs || deps.timeoutMs;
    var attempt = opts._attempt || 0;

    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (!opts.skipAuth && session && session.getAccess()) {
      headers.Authorization = 'Bearer ' + session.getAccess();
    }

    var controller = null;
    var timer = null;
    if (typeof AbortController === 'function' && timeout) {
      controller = new AbortController();
      timer = setTimeout(function () {
        controller.abort();
      }, timeout);
    }

    var init = { method: method, headers: headers, signal: controller ? controller.signal : undefined };
    if (opts.body !== undefined) {
      init.body = opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
    }

    var fetchImpl = deps.fetchImpl || (global.fetch ? global.fetch.bind(global) : null);
    if (!fetchImpl) {
      return Promise.reject(ApiError(ERROR_MESSAGES.offline, { code: 'network', status: 0 }));
    }

    return fetchImpl(url, init)
      .then(function (response) {
        if (timer) clearTimeout(timer);
        return response.text().then(function (text) {
          var payload = null;
          if (text) {
            try {
              payload = JSON.parse(text);
            } catch (error) {
              payload = null;
            }
          }
          return { response: response, payload: payload };
        });
      })
      .then(function (result) {
        var response = result.response;
        var payload = result.payload;

        if (response.ok) {
          if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
          return payload;
        }

        // ---- 401: one transparent refresh attempt, then surface the session expiry ----
        if (response.status === 401 && !opts.skipAuth && attempt === 0 && typeof deps.refresh === 'function') {
          return sharedRefresh()
            .then(function (refreshed) {
              if (!refreshed) throw ApiError(ERROR_MESSAGES.unauthorized, { status: 401, code: 'unauthorized' });
              var next = Object.assign({}, opts, { _attempt: 1 });
              return request(method, path, next);
            })
            .catch(function () {
              if (session && typeof session.expire === 'function') session.expire();
              if (typeof deps.onUnauthorized === 'function') deps.onUnauthorized();
              throw ApiError(ERROR_MESSAGES.unauthorized, { status: 401, code: 'unauthorized' });
            });
        }

        // A 401 on a skipAuth call (login/refresh) is a credential failure for THAT call:
        // it must not tear down an existing session or navigate away (the caller shows the message).
        if (response.status === 401 && !opts.skipAuth) {
          if (session && typeof session.expire === 'function') session.expire();
          if (typeof deps.onUnauthorized === 'function') deps.onUnauthorized();
        }

        var serverMessage = payload && typeof payload.message === 'string' ? payload.message : '';
        var code = codeForStatus(response.status);
        var message = serverMessage || ERROR_MESSAGES[code] || ERROR_MESSAGES.server;
        if (Array.isArray(payload && payload.message)) message = ERROR_MESSAGES.validation;
        throw ApiError(message, {
          status: response.status,
          code: code,
          fields: extractFields(payload),
          details: payload,
        });
      })
      .catch(function (error) {
        if (timer) clearTimeout(timer);
        if (error && error.isApiError) throw error;
        if (error && error.name === 'AbortError') {
          throw ApiError(ERROR_MESSAGES.timeout, { code: 'timeout', status: 0 });
        }
        throw ApiError(ERROR_MESSAGES.network, { code: 'network', status: 0, details: error });
      });
  }

  var SETTINGS = null;

  var api = {
    configure: configure,
    ERROR_MESSAGES: ERROR_MESSAGES,
    ApiError: ApiError,
    buildQuery: buildQuery,
    codeForStatus: codeForStatus,
    get: function (path, options) {
      return request('GET', path, options);
    },
    post: function (path, body, options) {
      return request('POST', path, Object.assign({}, options || {}, { body: body === undefined ? {} : body }));
    },
    patch: function (path, body, options) {
      return request('PATCH', path, Object.assign({}, options || {}, { body: body === undefined ? {} : body }));
    },
    put: function (path, body, options) {
      return request('PUT', path, Object.assign({}, options || {}, { body: body === undefined ? {} : body }));
    },
    del: function (path, options) {
      return request('DELETE', path, options || {});
    },
    request: request,
  };

  global.ALW = global.ALW || {};
  global.ALW.api = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
