import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { auditCartEvents } from '../common/constants';
import { money, multiplyMoney, sumMoney, toMoneyString } from '../common/utils/money.util';
import type { RequestMeta } from '../common/types/request-meta';
import { CartService, CartLineView } from '../cart/cart.service';
import { CartIssue, CART_ISSUE } from '../cart/cart.constants';

export interface CheckoutPreview {
  cartId: number | null;
  items: CartLineView[];
  itemCount: number;
  totalQuantity: number;
  subtotal: string;
  shipping: null;
  discount: string;
  total: string;
  currency: string;
  canCheckout: boolean;
  blockedReasons: CartIssue[];
  issues: CartIssue[];
  /** Stage 5 is a preview only — no order/payment/reservation is created. */
  createsOrder: false;
  createsPayment: false;
  reservesInventory: false;
}

/**
 * Checkout preview: a read-only snapshot of the cart after re-reading products,
 * prices and inventory from the database. It never writes anything.
 * Orders / payments / stock reservation belong to later stages.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly cart: CartService,
    private readonly audit: AuditService,
  ) {}

  async preview(userId: string, meta: RequestMeta = {}): Promise<CheckoutPreview> {
    const cart = await this.cart.loadForCheckout(userId);
    const view = this.cart.buildCartView(cart);

    if (!cart || view.items.length === 0) {
      throw new ConflictException('السلة فارغة — أضف منتجات قبل إتمام الطلب');
    }

    const blockedReasons = Array.from(new Set(view.items.flatMap((i) => i.issues)));
    const subtotal = view.subtotal;

    if (blockedReasons.length) {
      // Business state blocks checkout, but the client still needs the full picture.
      const detail = this.describe(blockedReasons);
      await this.auditPreview(userId, cart.id, view.items.length, meta, false);
      throw new ConflictException(`لا يمكن إتمام الطلب: ${detail}`);
    }

    const discount = money(0);
    const total = sumMoney([money(subtotal), discount]);

    await this.auditPreview(userId, cart.id, view.items.length, meta, true);

    return {
      cartId: cart.id,
      items: view.items.map((item) => ({
        ...item,
        lineSubtotal: toMoneyString(multiplyMoney(money(item.unitPrice), item.quantity))!,
      })),
      itemCount: view.itemCount,
      totalQuantity: view.totalQuantity,
      subtotal: toMoneyString(subtotal)!,
      shipping: null,
      discount: toMoneyString(discount)!,
      total: toMoneyString(total)!,
      currency: view.currency,
      canCheckout: true,
      blockedReasons: [],
      issues: [],
      createsOrder: false,
      createsPayment: false,
      reservesInventory: false,
    };
  }

  private describe(reasons: CartIssue[]): string {
    const labels: Record<string, string> = {
      [CART_ISSUE.PRODUCT_INACTIVE]: 'يوجد منتج غير نشط',
      [CART_ISSUE.PRODUCT_UNAVAILABLE]: 'يوجد منتج غير متاح',
      [CART_ISSUE.OUT_OF_STOCK]: 'يوجد منتج نفد من المخزون',
      [CART_ISSUE.INSUFFICIENT_STOCK]: 'الكمية المطلوبة تتجاوز المتاح',
      [CART_ISSUE.QUANTITY_LIMIT_EXCEEDED]: 'الكمية تتجاوز الحد المسموح',
    };
    return reasons.map((r) => labels[r] ?? r).join(' · ');
  }

  private async auditPreview(
    userId: string,
    cartId: number | null,
    itemCount: number,
    meta: RequestMeta,
    canCheckout: boolean,
  ): Promise<void> {
    if (!auditCartEvents()) return;
    await this.audit.log({
      action: AUDIT.CHECKOUT_PREVIEW_CREATED,
      actorId: userId,
      entity: 'cart',
      entityId: cartId ? String(cartId) : undefined,
      metadata: { itemCount, canCheckout },
      ...meta,
    });
  }
}
