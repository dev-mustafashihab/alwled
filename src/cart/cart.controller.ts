import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { requestMeta } from '../common/types/request-meta';

/**
 * Customer cart — JWT only (no permission keys): a cart belongs to its owner.
 * The user id is always taken from the access token, never from the request body.
 */
@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({
    summary: 'سلة المستخدم الحالي',
    description:
      'الأسعار تُقرأ من المنتج مباشرة (لا تُخزَّن في السلة). كل سطر يحمل حالة التوفر ' +
      '(isAvailable / availableQuantity / issues) دون حذف أي عنصر تلقائياً. ' +
      'سلة فارغة تُعيد id=null وitems=[] بدون إنشاء صف في قاعدة البيانات.',
  })
  @ApiResponse({ status: 200, description: 'items + subtotal + totalQuantity' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  get(@CurrentUser() user: JwtPayload) {
    return this.cart.getCart(user.sub);
  }

  @Post('items')
  @ApiOperation({
    summary: 'إضافة منتج إلى السلة',
    description:
      'إضافة منتج موجود مسبقاً في السلة **تضبط** الكمية إلى القيمة المُرسلة (لا تراكم صامت). ' +
      'السعر يُتجاهل من العميل — أي حقل غير معروف (price/subtotal) يُرفض بـ400. ' +
      'لا يتم حجز مخزون في هذه المرحلة.',
  })
  @ApiResponse({ status: 201, description: 'السلة بعد الإضافة' })
  @ApiResponse({ status: 400, description: 'كمية غير صحيحة أو حقول غير مسموحة' })
  @ApiResponse({ status: 404, description: 'المنتج غير موجود' })
  @ApiResponse({ status: 409, description: 'المنتج غير نشط أو المخزون غير كافٍ' })
  add(
    @Body() dto: AddCartItemDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.cart.addItem(user.sub, dto, requestMeta(req));
  }

  @Patch('items/:itemId')
  @ApiOperation({
    summary: 'تعديل كمية عنصر في السلة',
    description: 'العنصر يجب أن يخص سلة المستخدم الحالي. المنتج يجب أن يبقى نشطاً ومتوفراً.',
  })
  @ApiResponse({ status: 200, description: 'السلة بعد التعديل' })
  @ApiResponse({ status: 404, description: 'العنصر غير موجود في سلتك' })
  @ApiResponse({ status: 409, description: 'المنتج غير نشط أو الكمية تتجاوز المتاح' })
  update(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.cart.updateItem(user.sub, itemId, dto, requestMeta(req));
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'حذف عنصر من السلة' })
  @ApiResponse({ status: 200, description: 'السلة بعد الحذف' })
  @ApiResponse({ status: 404, description: 'العنصر غير موجود في سلتك' })
  remove(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.cart.removeItem(user.sub, itemId, requestMeta(req));
  }

  @Delete()
  @ApiOperation({
    summary: 'تفريغ السلة بالكامل',
    description: 'يحذف العناصر فقط ويُبقي صف السلة — لا حذف للـCart نفسه.',
  })
  @ApiResponse({ status: 200, description: 'سلة فارغة' })
  clear(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.cart.clearCart(user.sub, requestMeta(req));
  }
}
