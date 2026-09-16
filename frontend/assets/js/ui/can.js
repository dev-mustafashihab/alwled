/**
 * alwled — بوابة الصلاحيات في الواجهة (PermissionGate).
 * استخدام: ALW.can.render('products.create', buttonNode) → يعيد العنصر إن كانت الصلاحية موجودة، وإلا null.
 * أو ضع data-can="products.create" على أي عنصر ثم نادِ ALW.can.applyGates(root).
 * ملاحظة: هذا لإخفاء/تعطيل الواجهة فقط — الخادم يفرض الصلاحية دائمًا.
 */
(function (global) {
  'use strict';

  function permissions() {
    var auth = global.ALW && global.ALW.auth;
    if (auth && typeof auth.permissions === 'function') return auth.permissions();
    return (global.ALW && global.ALW.permissions && global.ALW.permissions.empty) || null;
  }

  function can(permission) {
    var perms = permissions();
    if (!perms) return false;
    if (Array.isArray(permission)) return perms.hasAny(permission);
    return perms.has(permission);
  }

  function canAny(list) {
    var perms = permissions();
    return perms ? perms.hasAny(list) : false;
  }

  /**
   * disabledMode: 'hide' (افتراضي) أو 'disable' (أظهر العنصر معطّلاً + tooltip).
   */
  function render(permission, node, disabledMode) {
    if (!node) return null;
    if (can(permission)) return node;
    if (disabledMode === 'disable') {
      node.disabled = true;
      node.setAttribute('aria-disabled', 'true');
      node.title = 'لا تملك صلاحية تنفيذ هذه العملية';
      node.classList.add('is-permission-locked');
      return node;
    }
    return null;
  }

  /** Elements with data-can="key" are removed (or disabled with data-can-mode="disable"). */
  function applyGates(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-can]'), function (node) {
      var key = node.getAttribute('data-can');
      if (!key) return;
      if (can(key)) {
        node.removeAttribute('data-can');
        return;
      }
      if (node.getAttribute('data-can-mode') === 'disable') {
        node.disabled = true;
        node.setAttribute('aria-disabled', 'true');
        node.title = 'لا تملك صلاحية تنفيذ هذه العملية';
        node.removeAttribute('data-can');
        return;
      }
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    return scope;
  }

  var api = { can: can, canAny: canAny, render: render, applyGates: applyGates };

  global.ALW = global.ALW || {};
  global.ALW.can = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
