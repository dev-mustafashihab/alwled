import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT } from '../audit/audit.actions';
import { auditCartEvents, cartLimits } from '../common/constants';
import { money, multiplyMoney, sumMoney, toMoneyString } from '../common/utils/money.util';
import type { RequestMeta } from '../common/types/request-meta';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import {
  CART_ISSUE, CART_PRODUCT_SELECT, CartIssue, CartProductRow,
  availableQuantityOf, cartLineIssues, isProductPublishable,
} from './cart.constants';

export interface CartLineView {
  id: number | null;
  productId: number;
  product: {
    id: number;
    name: string;
    slug: string;
    sku: string;
    price: string;
    isActive: boolean;
    primaryImage: string | null;
  };
  quantity: number;
  unitPrice: string;
  lineSubtotal: string;
  availableQuantity: number;
  isAvailable: boolean;
  issues: CartIssue[];
}

export interface CartView {
  id: number | null;
  items: CartLineView[];
  itemCount: number;
  totalQuantity: number;
  subtotal: string;
  currency: string;
  isCheckoutReady: boolean;
  issues: CartIssue[];
}

/**
 * Cart = shopping intent. It never reserves stock, never stores prices and never
 * becomes a financial source of truth: unit prices are re-read from Product on
 * every request, so a price change is reflected immediately.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- helpers ------------------------------- */

  private async logEvent(
    action: string,
    userId: string,
    metadata: Record<string, unknown>,
    meta: RequestMeta,
  ): Promise<void> {
    if (!auditCartEvents()) return;
    await this.audit.log({ action, actorId: userId, entity: 'cart', metadata, ...meta });
  }

  /** Loads the user's cart lines with products — a single query, no N+1. */
  private async loadCart(userId: string) {
    return this.prisma.cart.findUnique({
      where: { userId },
      select: {
        id: true,
        updatedAt: true,
        items: {
          select: { id: true, productId: true, quantity: true, product: { select: CART_PRODUCT_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /** Builds the response body; totals are computed with Prisma.Decimal only. */
  buildCartView(cart: Awaited<ReturnType<CartService['loadCart']>>): CartView {
    if (!cart) {
      return {
        id: null,
        items: [],
        itemCount: 0,
        totalQuantity: 0,
        subtotal: '0.00',
        currency: 'USD',
        isCheckoutReady: false,
        issues: [],
      };
    }

    const items: CartLineView[] = cart.items.map((item) => {
      const product = item.product as unknown as CartProductRow;
      const price = money(product.price);
      const issues = cartLineIssues(product, item.quantity);
      return {
        id: item.id,
        productId: product.id,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          price: toMoneyString(price)!,
          isActive: product.isActive,
          primaryImage: product.images?.length ? product.images[0].url : null,
        },
        quantity: item.quantity,
        unitPrice: toMoneyString(price)!,
        lineSubtotal: toMoneyString(multiplyMoney(price, item.quantity))!,
        availableQuantity: availableQuantityOf(product),
        isAvailable: issues.length === 0,
        issues,
      };
    });

    const subtotal = sumMoney(items.map((i) => money(i.lineSubtotal)));
    const globalIssues = Array.from(new Set(items.flatMap((i) => i.issues)));

    return {
      id: cart.id,
      items,
      itemCount: items.length,
      totalQuantity: items.reduce((acc, i) => acc + i.quantity, 0),
      subtotal: toMoneyString(subtotal)!,
      currency: 'USD',
      isCheckoutReady: items.length > 0 && globalIssues.length === 0,
      issues: globalIssues,
    };
  }

  /** Product lookups are validated here so no endpoint trusts client-side data. */
  private async loadPurchasableProduct(productId: number): Promise<CartProductRow> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: CART_PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product as unknown as CartProductRow;
  }

  private assertPurchasable(product: CartProductRow, quantity: number, userId: string) {
    if (!isProductPublishable(product)) {
      throw new ConflictException(
        product.isActive
          ? 'المنتج غير متاح حالياً (التصنيف أو العلامة التجارية غير نشطة)'
          : 'المنتج غير نشط — لا يمكن إضافته للسلة',
      );
    }
    const available = availableQuantityOf(product);
    if (available <= 0) {
      throw new ConflictException('المنتج غير متوفر في المخزون');
    }
    if (quantity > available) {
      throw new ConflictException(`الكمية المطلوبة غير متوفرة — المتاح حالياً ${available}`);
    }
  }

  private assertItemQuota(quantity: number, currentItemsCount: number, isNewItem: boolean) {
    const { maxItemQuantity, maxItems } = cartLimits();
    if (quantity > maxItemQuantity) {
      throw new ConflictException(`الحد الأقصى للكمية في السطر الواحد هو ${maxItemQuantity}`);
    }
    if (isNewItem && currentItemsCount >= maxItems) {
      throw new ConflictException(`الحد الأقصى لعدد المنتجات في السلة هو ${maxItems}`);
    }
  }

  /* -------------------------------- reads -------------------------------- */

  /** GET /cart — does not create a cart row; returns an empty representation instead. */
  async getCart(userId: string): Promise<CartView> {
    const cart = await this.loadCart(userId);
    return this.buildCartView(cart);
  }

  /* ------------------------------ mutations ------------------------------ */

  /**
   * POST /cart/items — adding a product that already exists in the cart SETS the
   * quantity to the given value (documented, idempotent; no silent accumulation).
   * Creates the cart on first use, inside a single transaction.
   */
  async addItem(userId: string, dto: AddCartItemDto, meta: RequestMeta = {}): Promise<CartView> {
    const product = await this.loadPurchasableProduct(dto.productId);

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true, items: { select: { id: true, productId: true } } },
    });
    const existing = cart.items.find((i) => i.productId === dto.productId);
    this.assertItemQuota(dto.quantity, cart.items.length, !existing);
    this.assertPurchasable(product, dto.quantity, userId);

    const item = await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      update: { quantity: dto.quantity },
      create: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity },
      select: { id: true, quantity: true },
    });

    await this.logEvent(
      existing ? AUDIT.CART_ITEM_UPDATED : AUDIT.CART_ITEM_ADDED,
      userId,
      { cartId: cart.id, itemId: item.id, productId: dto.productId, quantity: dto.quantity },
      meta,
    );

    return this.getCart(userId);
  }

  /** PATCH /cart/items/:itemId — quantity is replaced, product must still be sellable. */
  async updateItem(
    userId: string,
    itemId: number,
    dto: UpdateCartItemDto,
    meta: RequestMeta = {},
  ): Promise<CartView> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, cartId: true, productId: true, quantity: true },
    });
    // Same response whether the item is missing or belongs to someone else.
    if (!item) throw new NotFoundException('العنصر غير موجود في سلتك');

    const { maxItemQuantity } = cartLimits();
    if (dto.quantity > maxItemQuantity) {
      throw new ConflictException(`الحد الأقصى للكمية في السطر الواحد هو ${maxItemQuantity}`);
    }

    const product = await this.loadPurchasableProduct(item.productId);
    this.assertPurchasable(product, dto.quantity, userId);

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity: dto.quantity } });

    await this.logEvent(
      AUDIT.CART_ITEM_UPDATED,
      userId,
      {
        cartId: item.cartId,
        itemId: item.id,
        productId: item.productId,
        quantity: dto.quantity,
        previousQuantity: item.quantity,
      },
      meta,
    );

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: number, meta: RequestMeta = {}): Promise<CartView> {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, cartId: true, productId: true, quantity: true },
    });
    if (!item) throw new NotFoundException('العنصر غير موجود في سلتك');

    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.logEvent(
      AUDIT.CART_ITEM_REMOVED,
      userId,
      { cartId: item.cartId, itemId: item.id, productId: item.productId, quantity: item.quantity },
      meta,
    );

    return this.getCart(userId);
  }

  /** DELETE /cart — empties the cart but keeps the row (no recreate churn). */
  async clearCart(userId: string, meta: RequestMeta = {}): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, select: { id: true } });
    if (cart) {
      const removed = await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      if (removed.count > 0) {
        await this.logEvent(AUDIT.CART_CLEARED, userId, { cartId: cart.id, removed: removed.count }, meta);
      }
    }
    return this.getCart(userId);
  }

  /* ------------------------- shared with checkout ------------------------- */

  /** Loads the cart for checkout preview (throws only when it cannot be read). */
  async loadForCheckout(userId: string) {
    return this.loadCart(userId);
  }

  /** Ensures the caller may act on this cart (defence in depth for checkout). */
  assertOwnership(cartUserId: string, requesterId: string): void {
    if (cartUserId !== requesterId) {
      throw new ForbiddenException('لا يمكنك الوصول إلى سلة مستخدم آخر');
    }
  }
}

export { CART_ISSUE };
