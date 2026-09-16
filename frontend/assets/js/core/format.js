/**
 * alwled — pure formatting + enum-label helpers (no DOM, unit-testable in Node).
 * كل النصوص العربية للواجهة تعيش هنا بدل تكرارها داخل الصفحات.
 */
(function (global) {
  'use strict';

  var CURRENCY_SYMBOLS = { USD: '$', EUR: '€', SYP: 'ل.س', TRY: '₺', SAR: 'ر.س' };

  var ORDER_STATUS = {
    PENDING: { label: 'قيد الانتظار', tone: 'warning' },
    CONFIRMED: { label: 'مؤكَّد', tone: 'success' },
    CANCELLED: { label: 'ملغى', tone: 'neutral' },
  };

  var PAYMENT_STATUS = {
    PENDING: { label: 'بانتظار الدفع', tone: 'warning' },
    PENDING_REVIEW: { label: 'بانتظار المراجعة', tone: 'info' },
    PROCESSING: { label: 'قيد المعالجة', tone: 'info' },
    SUCCEEDED: { label: 'ناجحة', tone: 'success' },
    FAILED: { label: 'فاشلة', tone: 'danger' },
    CANCELLED: { label: 'ملغاة', tone: 'neutral' },
  };

  var PAYMENT_METHOD = {
    SHAM_CASH: { label: 'شام كاش (تحويل يدوي)', tone: 'brand' },
    CASH_ON_DELIVERY: { label: 'الدفع عند التسليم', tone: 'neutral' },
    CARD: { label: 'بطاقة', tone: 'neutral' },
  };

  var VERIFICATION_STATUS = {
    NOT_STARTED: { label: 'لم يبدأ', tone: 'neutral' },
    PENDING: { label: 'قيد الانتظار', tone: 'warning' },
    IN_REVIEW: { label: 'قيد المراجعة', tone: 'info' },
    VERIFIED: { label: 'موثَّق', tone: 'success' },
    REJECTED: { label: 'مرفوض', tone: 'danger' },
    EXPIRED: { label: 'منتهي', tone: 'neutral' },
    CANCELLED: { label: 'ملغى', tone: 'neutral' },
  };

  var USER_STATUS = {
    ACTIVE: { label: 'نشط', tone: 'success' },
    SUSPENDED: { label: 'موقوف', tone: 'danger' },
    DELETED: { label: 'محذوف', tone: 'neutral' },
  };

  var DELIVERY_STATUS = {
    PENDING: { label: 'قيد الإرسال', tone: 'warning' },
    DELIVERED: { label: 'وصل', tone: 'success' },
    FAILED: { label: 'فشل', tone: 'danger' },
  };

  var NOTIFICATION_TYPE = {
    ORDER_CREATED: { label: 'طلب جديد', tone: 'brand', icon: 'cart' },
    ORDER_CONFIRMED: { label: 'تأكيد طلب', tone: 'success', icon: 'check-circle' },
    ORDER_CANCELLED: { label: 'إلغاء طلب', tone: 'neutral', icon: 'x-circle' },
    PAYMENT_CREATED: { label: 'دفعة جديدة', tone: 'brand', icon: 'credit-card' },
    PAYMENT_SUBMITTED_FOR_REVIEW: { label: 'إثبات بانتظار المراجعة', tone: 'info', icon: 'upload' },
    PAYMENT_REVIEW_REQUIRED: { label: 'مطلوب مراجعة دفعة', tone: 'warning', icon: 'alert-circle' },
    PAYMENT_CONFIRMED: { label: 'تأكيد دفعة', tone: 'success', icon: 'check-circle' },
    PAYMENT_REJECTED: { label: 'رفض دفعة', tone: 'danger', icon: 'x-circle' },
    VERIFICATION_STARTED: { label: 'بدء تحقق', tone: 'info', icon: 'shield' },
    VERIFICATION_REVIEWED: { label: 'مراجعة تحقق', tone: 'info', icon: 'shield' },
    VERIFICATION_VERIFIED: { label: 'توثيق عميل', tone: 'success', icon: 'shield-check' },
    VERIFICATION_REJECTED: { label: 'رفض تحقق', tone: 'danger', icon: 'shield-x' },
    LOW_STOCK: { label: 'مخزون منخفض', tone: 'warning', icon: 'trending-down' },
    OUT_OF_STOCK: { label: 'نفاد المخزون', tone: 'danger', icon: 'package-x' },
  };

  var MOVEMENT_TYPE = {
    STOCK_IN: 'إدخال مخزون',
    STOCK_OUT: 'إخراج مخزون',
    ADJUSTMENT: 'تسوية',
    RESERVATION: 'حجز (طلب)',
    RELEASE: 'تحرير حجز',
    SALE: 'بيع',
    RETURN: 'إرجاع',
  };

  var AUDIT_ACTION = {
    USER_REGISTERED: 'تسجيل مستخدم',
    USER_LOGIN: 'تسجيل دخول',
    USER_LOGOUT: 'تسجيل خروج',
    USER_LOGIN_FAILED: 'فشل تسجيل دخول',
    PASSWORD_RESET_REQUESTED: 'طلب إعادة تعيين كلمة المرور',
    PASSWORD_RESET: 'إعادة تعيين كلمة المرور',
    PASSWORD_CHANGED: 'تغيير كلمة المرور',
    ACCOUNT_VERIFIED: 'توثيق حساب',
    ROLE_CREATED: 'إنشاء دور',
    ROLE_UPDATED: 'تعديل دور',
    ROLE_DELETED: 'حذف دور',
    ROLE_ASSIGNED: 'إسناد دور',
    ROLE_REVOKED: 'سحب دور',
    EMPLOYEE_CREATED: 'إنشاء موظف',
    EMPLOYEE_UPDATED: 'تعديل موظف',
    EMPLOYEE_DISABLED: 'تعطيل موظف',
    USER_DISABLED: 'تعطيل مستخدم',
    USER_ENABLED: 'تفعيل مستخدم',
    PRODUCT_CREATED: 'إنشاء منتج',
    ORDER_CREATED: 'إنشاء طلب',
    ORDER_CONFIRMED: 'تأكيد طلب',
    ORDER_CANCELLED: 'إلغاء طلب',
    PAYMENT_CREATED: 'إنشاء دفعة',
    PAYMENT_SUBMITTED_FOR_REVIEW: 'إرسال إثبات دفع',
    PAYMENT_CONFIRMED: 'تأكيد دفعة',
    PAYMENT_REJECTED: 'رفض دفعة',
    INVENTORY_ADJUSTED: 'تسوية مخزون',
    VERIFICATION_STARTED: 'بدء تحقق',
    VERIFICATION_REVIEWED: 'مراجعة تحقق',
    VERIFICATION_VERIFIED: 'توثيق عميل',
    VERIFICATION_REJECTED: 'رفض تحقق',
  };

  var ENTITY_LABEL = {
    user: 'مستخدم',
    order: 'طلب',
    payment: 'دفعة',
    product: 'منتج',
    category: 'تصنيف',
    brand: 'علامة تجارية',
    role: 'دور',
    permission: 'صلاحية',
    inventory: 'مخزون',
    customer_verification: 'تحقق عميل',
    verification: 'تحقق عميل',
    cart: 'سلة',
    specification: 'مواصفة',
    product_image: 'صورة منتج',
  };

  /** Splits an API money string ("350.00") into parts without float math on the value. */
  function parseMoney(value) {
    if (value === null || value === undefined || value === '') return { amount: null, raw: '' };
    var raw = String(value).trim();
    var negative = raw.charAt(0) === '-';
    var body = negative ? raw.slice(1) : raw;
    var parts = body.split('.');
    var whole = parts[0].replace(/[^\d]/g, '');
    var fraction = (parts[1] || '').replace(/[^\d]/g, '').slice(0, 2);
    if (!whole && !fraction) return { amount: null, raw: raw };
    return {
      // always two decimals: the backend stores NUMERIC(12,2) and the UI must not drift from it
      amount: (negative ? '-' : '') + (whole || '0') + '.' + fraction.padEnd(2, '0'),
      raw: raw,
    };
  }

  /** "350.00" + "USD" → "350.00 $" (no float conversion, keeps server precision). */
  function money(value, currency) {
    var parsed = parseMoney(value);
    if (parsed.amount === null) return '—';
    var symbol = currency ? CURRENCY_SYMBOLS[String(currency).toUpperCase()] || String(currency).toUpperCase() : '';
    return symbol ? parsed.amount + ' ' + symbol : parsed.amount;
  }

  function number(value) {
    if (value === null || value === undefined || value === '') return '—';
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-US');
  }

  function percent(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return n.toFixed(decimals === undefined ? 1 : decimals) + '%';
  }

  var AR_MONTHS = ['يناير', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** ISO → "16 أيلول 2026، 09:35" (local time, fixed components for stable tests). */
  function dateTime(value) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '، ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dateOnly(value) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** "<5 دقائق" style relative time; falls back to an absolute date after 30 days. */
  function relative(value, now) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    var ref = now ? new Date(now) : new Date();
    var diff = Math.floor((ref.getTime() - d.getTime()) / 1000);
    if (diff < 0) return 'الآن';
    if (diff < 60) return 'الآن';
    if (diff < 3600) return 'قبل ' + Math.floor(diff / 60) + ' دقيقة';
    if (diff < 86400) return 'قبل ' + Math.floor(diff / 3600) + ' ساعة';
    if (diff < 604800) return 'قبل ' + Math.floor(diff / 86400) + ' يوم';
    if (diff < 2592000) return 'قبل ' + Math.floor(diff / 604800) + ' أسبوع';
    if (diff < 2592000 * 12) return 'قبل ' + Math.floor(diff / 2592000) + ' شهر';
    return dateOnly(d);
  }

  /** yyyy-mm-dd for <input type="date"> (UTC, matches the dashboard range semantics). */
  function toDateInput(value) {
    if (!value) return '';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function todayInput(now) {
    return toDateInput(now || new Date());
  }

  function daysBetweenInput(fromInput, toInput) {
    if (!fromInput || !toInput) return null;
    var from = new Date(fromInput + 'T00:00:00Z').getTime();
    var to = new Date(toInput + 'T00:00:00Z').getTime();
    if (isNaN(from) || isNaN(to)) return null;
    return Math.round((to - from) / 86400000);
  }

  function enumLabel(map, key) {
    if (key === null || key === undefined || key === '') return '—';
    var entry = map[String(key)];
    return entry ? (entry.label || entry) : String(key);
  }

  function enumTone(map, key) {
    var entry = map[String(key)];
    return entry && entry.tone ? entry.tone : 'neutral';
  }

  function initials(first, last) {
    var a = (first || '').trim().charAt(0);
    var b = (last || '').trim().charAt(0);
    var text = (a + b).trim();
    return text || '؟';
  }

  function fullName(user) {
    if (!user) return '—';
    var name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.phone || user.email || user.id || '—';
  }

  function shortId(id, size) {
    if (!id) return '—';
    var s = String(id);
    var n = size || 10;
    return s.length <= n ? s : s.slice(0, n) + '…';
  }

  function pluralize(count, one, few, many) {
    if (count === 1) return one;
    if (count >= 3 && count <= 10) return few;
    return many;
  }

  function formatBytes(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n <= 0) return '0 ب';
    var units = ['ب', 'ك.ب', 'م.ب', 'غ.ب'];
    var i = Math.floor(Math.log(n) / Math.log(1024));
    i = Math.min(i, units.length - 1);
    return (n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  var api = {
    CURRENCY_SYMBOLS: CURRENCY_SYMBOLS,
    ORDER_STATUS: ORDER_STATUS,
    PAYMENT_STATUS: PAYMENT_STATUS,
    PAYMENT_METHOD: PAYMENT_METHOD,
    VERIFICATION_STATUS: VERIFICATION_STATUS,
    USER_STATUS: USER_STATUS,
    DELIVERY_STATUS: DELIVERY_STATUS,
    NOTIFICATION_TYPE: NOTIFICATION_TYPE,
    MOVEMENT_TYPE: MOVEMENT_TYPE,
    AUDIT_ACTION: AUDIT_ACTION,
    ENTITY_LABEL: ENTITY_LABEL,
    AR_MONTHS: AR_MONTHS,
    parseMoney: parseMoney,
    money: money,
    number: number,
    percent: percent,
    dateTime: dateTime,
    dateOnly: dateOnly,
    relative: relative,
    toDateInput: toDateInput,
    todayInput: todayInput,
    daysBetweenInput: daysBetweenInput,
    enumLabel: enumLabel,
    enumTone: enumTone,
    initials: initials,
    fullName: fullName,
    shortId: shortId,
    pluralize: pluralize,
    formatBytes: formatBytes,
  };

  global.ALW = global.ALW || {};
  global.ALW.format = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
