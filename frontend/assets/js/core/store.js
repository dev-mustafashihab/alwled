/**
 * alwled — متجر حالة صغير (بدون مكتبات).
 * يفصل: auth state / UI state / server state (كل قسم يحتفظ بحالته في الصفحات).
 */
(function (global) {
  'use strict';

  function createStore(initial) {
    var state = initial || {};
    var subscribers = [];

    return {
      get: function () {
        return state;
      },
      set: function (partial) {
        var next = typeof partial === 'function' ? partial(state) : partial;
        state = Object.assign({}, state, next || {});
        subscribers.slice().forEach(function (fn) {
          try {
            fn(state);
          } catch (error) {
            /* subscriber errors must not break the app */
          }
        });
        return state;
      },
      subscribe: function (fn) {
        subscribers.push(fn);
        return function () {
          subscribers = subscribers.filter(function (item) {
            return item !== fn;
          });
        };
      },
      reset: function (next) {
        state = next || {};
        subscribers.slice().forEach(function (fn) {
          fn(state);
        });
      },
    };
  }

  var api = { createStore: createStore };

  global.ALW = global.ALW || {};
  global.ALW.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
