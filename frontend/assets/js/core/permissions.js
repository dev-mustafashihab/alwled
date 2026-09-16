/**
 * alwled — permission helpers (pure logic, unit-testable).
 * الصلاحيات تأتي من GET /auth/me (حقل permissions) — لا نستخدم أسماء الأدوار للتحكم.
 * إخفاء عنصر في الواجهة ليس حماية: الخادم يفرض الصلاحية على كل طلب.
 */
(function (global) {
  'use strict';

  var WILDCARD = '*';

  function create(list, roles) {
    var keys = Array.isArray(list) ? list.slice() : [];
    var set = Object.create(null);
    keys.forEach(function (key) {
      set[key] = true;
    });
    var wildcard = set[WILDCARD] === true;

    return {
      keys: keys,
      roles: Array.isArray(roles) ? roles.slice() : [],
      wildcard: wildcard,
      has: function (permission) {
        if (!permission) return false;
        if (wildcard) return true;
        return set[permission] === true;
      },
      hasAny: function (permissions) {
        if (!Array.isArray(permissions) || !permissions.length) return true;
        for (var i = 0; i < permissions.length; i += 1) {
          if (this.has(permissions[i])) return true;
        }
        return false;
      },
      hasAll: function (permissions) {
        if (!Array.isArray(permissions) || !permissions.length) return true;
        for (var i = 0; i < permissions.length; i += 1) {
          if (!this.has(permissions[i])) return false;
        }
        return true;
      },
      isStaff: function () {
        return this.roles.some(function (role) {
          return role !== 'CUSTOMER';
        });
      },
      label: function () {
        return this.roles.join('، ') || '—';
      },
    };
  }

  var EMPTY = create([], []);

  var api = { WILDCARD: WILDCARD, create: create, empty: EMPTY };

  global.ALW = global.ALW || {};
  global.ALW.permissions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
