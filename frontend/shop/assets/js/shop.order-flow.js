/**
 * alwled shop — منطق رحلة العميل (Stage 14.3): مفاتيح idempotency ثابتة، حالات الطلب/الدفع/التحقق،
 * الخط الزمني، وتوجيه الإشعارات. كل الدوال هنا نقية وقابلة للاختبار (بلا DOM وبلا شبكة).
 */
(function (global) {
  'use strict';

  var ALW = (global.ALW = global.ALW || {});
  var shop = ALW.shop;

  /* ------------------------------------------------------------------ idempotency */
  var IDEM_PREFIX = 'alwled.shop.idem.';

  function storageGet(key) {
    try {
      return global.sessionStorage ? global.sessionStorage.getItem(key) : null;
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (global.sessionStorage) global.sessionStorage.setItem(key, value);
    } catch (error) {
      /* storage blocked — the key then lives for this page only */
    }
  }

  var memoryKeys = {};

  /**
   * مفتاح idempotency ثابت لنفس العملية المنطقية:
   * - نفس scope + نفس fingerprint ⇒ نفس المفتاح (إعادة محاولة/نقرة مزدوجة لا تُنشئ عملية ثانية)
   * - تغيّر المحتوى (سلة مختلفة) ⇒ مفتاح جديد
   * المصدر الأول هو ذاكرة الصفحة (تعمل حتى لو مُنع sessionStorage)، والنسخة الثانية في sessionStorage للصمود أمام إعادة التحميل.
   */
  function idempotencyKey(scope, fingerprint) {
    var slot = IDEM_PREFIX + scope;
    var want = String(fingerprint);
    var cached = memoryKeys[slot];
    if (cached && cached.fingerprint === want) return cached.key;

    var stored = storageGet(slot);
    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        if (parsed && parsed.fingerprint === want && parsed.key) {
          memoryKeys[slot] = { fingerprint: want, key: parsed.key };
          return parsed.key;
        }
      } catch (error) {
        /* corrupted slot → regenerate below */
      }
    }
    var key = scope + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    memoryKeys[slot] = { fingerprint: want, key: key };
    storageSet(slot, JSON.stringify({ fingerprint: want, key: key }));
    return key;
  }

  function clearIdempotencyKey(scope) {
    try {
      if (global.sessionStorage) global.sessionStorage.removeItem(IDEM_PREFIX + scope);
    } catch (error) {
      /* ignore */
    }
    delete memoryKeys[IDEM_PREFIX + scope];
  }

  /** بصمة السلة: تُستخدم مع مفتاح الطلب حتى لا تُعاد نفس العملية بعد تعديل السلة. */
  function cartFingerprint(cart) {
    var items = (cart && cart.items) || [];
    return items.map(function (item) {
      return item.productId + 'x' + item.quantity;
    }).sort().join('|') || 'empty';
  }

  /* ------------------------------------------------------------------ status maps */
  var ORDER_STATUS = {
    PENDING: { label: 'قيد الانتظار', tone: 'warning' },
    CONFIRMED: { label: 'مؤكد', tone: 'success' },
    CANCELLED: { label: 'ملغى', tone: 'danger' },
  };

  var PAYMENT_STATUS = {
    PENDING: { label: 'بانتظار التحويل', tone: 'warning' },
    PENDING_REVIEW: { label: 'قيد المراجعة', tone: 'info' },
    PROCESSING: { label: 'قيد المعالجة', tone: 'info' },
    SUCCEEDED: { label: 'ناجحة', tone: 'success' },
    FAILED: { label: 'مرفوضة', tone: 'danger' },
    CANCELLED: { label: 'ملغاة', tone: 'neutral' },
  };

  var VERIFICATION_STATUS = {
    NOT_STARTED: { label: 'لم يبدأ', tone: 'neutral' },
    PENDING: { label: 'بانتظار الإرسال', tone: 'warning' },
    IN_REVIEW: { label: 'قيد المراجعة', tone: 'info' },
    VERIFIED: { label: 'موثّق', tone: 'success' },
    REJECTED: { label: 'مرفوض', tone: 'danger' },
    EXPIRED: { label: 'منتهي', tone: 'danger' },
    CANCELLED: { label: 'ملغى', tone: 'neutral' },
  };

  function meta(map, status, fallbackLabel) {
    return map[status] || { label: fallbackLabel || (status || '—'), tone: 'neutral' };
  }

  function orderStatusMeta(status) {
    return meta(ORDER_STATUS, status, 'غير معروف');
  }

  function paymentStatusMeta(status) {
    return meta(PAYMENT_STATUS, status, 'غير معروفة');
  }

  function verificationStatusMeta(status) {
    return meta(VERIFICATION_STATUS, status, 'غير معروفة');
  }

  /** حالة الإلغاء مبنية على الحالة الفعلية من الخادم فقط. */
  function canCancelOrder(order) {
    if (!order) return false;
    return order.status === 'PENDING' && !order.cancelledAt;
  }

  /**
   * إجراء التحقق المسموح — يعتمد على أعلام الخادم (canStart/canCancel) وليس على تخمين الواجهة.
   */
  function verificationAction(verification) {
    var state = verification || {};
    if (state.canStart === true) return 'start';
    if (state.canCancel === true) return 'cancel';
    return 'none';
  }

  /* ------------------------------------------------------------------ timeline (real data only) */
  /**
   * خط زمني من الحقول الحقيقية فقط؛ كل خطوة تُعرض فقط إذا كان لها دليل من الخادم.
   */
  function orderTimeline(order, payment) {
    var steps = [];
    var current = order || {};
    var pay = payment || null;

    // الخطوة الأولى حقيقية دائماً (الطلب موجود)، والتاريخ يُعرض فقط إن أعاده الـBackend
    steps.push({ key: 'created', label: 'تم إنشاء الطلب', at: current.createdAt || null, done: true, tone: 'success' });
    if (pay) {
      steps.push({
        key: 'payment_created', label: 'تم إنشاء الدفعة (شام كاش)', at: pay.createdAt,
        done: true, tone: 'info',
      });
      if (pay.submittedAt) {
        steps.push({ key: 'payment_submitted', label: 'تم إرسال إثبات التحويل', at: pay.submittedAt, done: true, tone: 'info' });
      }
      if (pay.status === 'SUCCEEDED' && pay.reviewedAt) {
        steps.push({ key: 'payment_confirmed', label: 'تم تأكيد الدفع', at: pay.reviewedAt, done: true, tone: 'success' });
      } else if (pay.status === 'FAILED' && pay.reviewedAt) {
        steps.push({ key: 'payment_rejected', label: 'تم رفض الدفعة', at: pay.reviewedAt, done: true, tone: 'danger' });
      } else if (pay.status === 'PENDING_REVIEW') {
        steps.push({ key: 'payment_review', label: 'الدفع قيد المراجعة من الفريق', at: pay.submittedAt || pay.updatedAt, done: false, tone: 'info' });
      }
    }
    if (current.status === 'CONFIRMED') {
      steps.push({ key: 'order_confirmed', label: 'تم تأكيد الطلب', at: current.updatedAt, done: true, tone: 'success' });
    }
    if (current.status === 'CANCELLED') {
      steps.push({ key: 'order_cancelled', label: 'تم إلغاء الطلب', at: current.cancelledAt || current.updatedAt, done: true, tone: 'danger' });
    }
    return steps;
  }

  /* ------------------------------------------------------------------ notifications */
  var PAYMENT_NOTIFICATION_TYPES = ['PAYMENT_CREATED', 'PAYMENT_SUBMITTED_FOR_REVIEW', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED'];
  var ORDER_NOTIFICATION_TYPES = ['ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_CANCELLED'];
  var VERIFICATION_NOTIFICATION_TYPES = ['VERIFICATION_STARTED', 'VERIFICATION_REVIEWED', 'VERIFICATION_VERIFIED', 'VERIFICATION_REJECTED'];

  function notificationCategory(type) {
    if (PAYMENT_NOTIFICATION_TYPES.indexOf(type) !== -1) return 'payment';
    if (ORDER_NOTIFICATION_TYPES.indexOf(type) !== -1) return 'order';
    if (VERIFICATION_NOTIFICATION_TYPES.indexOf(type) !== -1) return 'verification';
    return 'other';
  }

  /**
   * توجيه آمن: مسار داخلي معروف فقط، بلا اعتماد على نص قد يأتي من الخادم.
   * orderNumber يُقبل فقط إذا طابق النمط الرسمي (أحرف/أرقام/شرطات).
   */
  function notificationTarget(notification) {
    var item = notification || {};
    var data = item.data || {};
    var category = notificationCategory(item.type);
    var orderNumber = typeof data.orderNumber === 'string' && /^[A-Za-z0-9-]{4,32}$/.test(data.orderNumber) ? data.orderNumber : null;

    if (category === 'order' || category === 'payment') {
      if (orderNumber) return { kind: 'orders', label: 'عرض طلباتي', hash: shop.buildHash({ path: '/orders', query: { orderNumber: orderNumber } }) };
      return { kind: 'orders', label: 'عرض طلباتي', hash: shop.buildHash({ path: '/orders' }) };
    }
    if (category === 'verification') return { kind: 'verification', label: 'عرض حالة التوثيق', hash: shop.buildHash({ path: '/verification' }) };
    return null;
  }

  var orderFlow = {
    idempotencyKey: idempotencyKey,
    clearIdempotencyKey: clearIdempotencyKey,
    cartFingerprint: cartFingerprint,
    orderStatusMeta: orderStatusMeta,
    paymentStatusMeta: paymentStatusMeta,
    verificationStatusMeta: verificationStatusMeta,
    canCancelOrder: canCancelOrder,
    verificationAction: verificationAction,
    orderTimeline: orderTimeline,
    notificationCategory: notificationCategory,
    notificationTarget: notificationTarget,
    ORDER_STATUS: ORDER_STATUS,
    PAYMENT_STATUS: PAYMENT_STATUS,
    VERIFICATION_STATUS: VERIFICATION_STATUS,
  };

  ALW.shopOrderFlow = orderFlow;
  if (typeof module !== 'undefined' && module.exports) module.exports = orderFlow;
})(typeof window !== 'undefined' ? window : globalThis);
