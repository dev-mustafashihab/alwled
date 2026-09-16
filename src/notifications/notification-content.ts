import {
  NOTIFICATION_TYPE, NotificationTypeValue,
} from './notifications.constants';

/** Safe, server-generated payload for an event (ids/codes/amounts only). */
export interface NotificationPayload {
  orderNumber?: string;
  amount?: string;
  currency?: string;
  transactionReference?: string;
  productName?: string;
  sku?: string;
  available?: number;
  threshold?: number;
  status?: string;
  attempt?: number;
}

export interface NotificationContent {
  title: string;
  body: string;
  /** context stored with the notification — safe fields only */
  data: Record<string, string | number | null>;
}

/**
 * Content is generated exclusively on the server from trusted domain values.
 * Nothing here can be influenced by a client request, and no provider/secret,
 * proof content or identity document ever reaches a notification.
 */
export const buildNotificationContent = (
  type: NotificationTypeValue | string,
  payload: NotificationPayload = {},
): NotificationContent => {
  const order = payload.orderNumber ?? '-';
  const money = payload.amount ? `${payload.amount}${payload.currency ? ` ${payload.currency}` : ''}` : '';

  switch (type) {
    case NOTIFICATION_TYPE.ORDER_CREATED:
      return {
        title: 'تم إنشاء طلبك',
        body: `تم إنشاء الطلب ${order} بمبلغ ${money || 'غير محدد'} وهو الآن بانتظار الدفع.`,
        data: { orderNumber: order, amount: payload.amount ?? null },
      };
    case NOTIFICATION_TYPE.ORDER_CONFIRMED:
      return {
        title: 'تم تأكيد طلبك',
        body: `تم تأكيد الطلب ${order}. سنتابع تجهيزه.`,
        data: { orderNumber: order },
      };
    case NOTIFICATION_TYPE.ORDER_CANCELLED:
      return {
        title: 'تم إلغاء طلبك',
        body: `تم إلغاء الطلب ${order} وتحرير الكمية المحجوزة.`,
        data: { orderNumber: order },
      };
    case NOTIFICATION_TYPE.PAYMENT_CREATED:
      return {
        title: 'دفعة جديدة بانتظار التحويل',
        body: `أُنشئت دفعة للطلب ${order} بمبلغ ${money || 'غير محدد'}. الرجاء إتمام التحويل عبر شام كاش.`,
        data: { orderNumber: order, amount: payload.amount ?? null },
      };
    case NOTIFICATION_TYPE.PAYMENT_SUBMITTED_FOR_REVIEW:
      return {
        title: 'تم استلام إثبات الدفع',
        body: `وصلنا إثبات الدفع للطلب ${order} وهو الآن قيد المراجعة من الفريق.`,
        data: {
          orderNumber: order,
          amount: payload.amount ?? null,
          // the reference is an identifier the customer themselves sent — safe here
          transactionReference: payload.transactionReference ?? null,
        },
      };
    case NOTIFICATION_TYPE.PAYMENT_CONFIRMED:
      return {
        title: 'تم تأكيد الدفع',
        body: `تم تأكيد دفعتك للطلب ${order} بمبلغ ${money || 'غير محدد'}.`,
        data: { orderNumber: order, amount: payload.amount ?? null },
      };
    case NOTIFICATION_TYPE.PAYMENT_REJECTED:
      return {
        // the internal rejection reason is deliberately NOT copied into the notification
        title: 'لم يتم تأكيد الدفع',
        body: `رُفض إثبات الدفع للطلب ${order}. يمكنك إرسال إثبات جديد من صفحة الدفعة.`,
        data: { orderNumber: order },
      };
    case NOTIFICATION_TYPE.VERIFICATION_STARTED:
      return {
        title: 'بدأ طلب التحقق',
        body: 'تم تسجيل طلب التحقق من حسابك وهو الآن بانتظار المراجعة.',
        data: { status: 'PENDING' },
      };
    case NOTIFICATION_TYPE.VERIFICATION_REVIEWED:
      return {
        title: 'طلب التحقق قيد المراجعة',
        body: 'فريقنا بدأ مراجعة طلب التحقق الخاص بحسابك.',
        data: { status: 'IN_REVIEW' },
      };
    case NOTIFICATION_TYPE.VERIFICATION_VERIFIED:
      return {
        title: 'تم توثيق حسابك',
        body: 'تم توثيق حسابك بعد مراجعة الفريق. شكراً لك.',
        data: { status: 'VERIFIED' },
      };
    case NOTIFICATION_TYPE.VERIFICATION_REJECTED:
      return {
        title: 'لم يتم توثيق الحساب',
        body: 'رُفض طلب التحقق. يمكنك إعادة المحاولة من صفحة التحقق.',
        data: { status: 'REJECTED' },
      };
    case NOTIFICATION_TYPE.LOW_STOCK:
      return {
        title: 'تنبيه مخزون منخفض',
        body: `المنتج ${payload.productName ?? '-'} (${payload.sku ?? '-'}) وصل للمتاح ${payload.available ?? 0} وهو عند/تحت حدّ التنبيه.`,
        data: {
          productName: payload.productName ?? null, sku: payload.sku ?? null,
          available: payload.available ?? null, threshold: payload.threshold ?? null,
        },
      };
    case NOTIFICATION_TYPE.OUT_OF_STOCK:
      return {
        title: 'تنبيه نفاد المخزون',
        body: `المنتج ${payload.productName ?? '-'} (${payload.sku ?? '-'}) نفد مخزونه المتاح.`,
        data: { productName: payload.productName ?? null, sku: payload.sku ?? null, available: payload.available ?? 0 },
      };
    case NOTIFICATION_TYPE.PAYMENT_REVIEW_REQUIRED:
      return {
        title: 'دفعة بانتظار المراجعة',
        body: `الدفعة للطلب ${order} بمبلغ ${money || 'غير محدد'} بانتظار قرار المراجعة.`,
        data: {
          orderNumber: order, amount: payload.amount ?? null,
          transactionReference: payload.transactionReference ?? null,
        },
      };
    default:
      // unknown type never reaches here (DTO/enum validated), and it must not invent content
      throw new Error(`نوع إشعار غير مدعوم: ${String(type)}`);
  }
};
