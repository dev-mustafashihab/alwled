import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { requestMeta } from '../common/types/request-meta';

/**
 * Checkout preview only. No order, no payment, no stock reservation — those are
 * later stages. Anonymous checkout is not allowed.
 */
@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'معاينة إتمام الطلب (لا تُنشئ طلباً ولا دفعة ولا تحجز مخزوناً)',
    description:
      'يعيد قراءة المنتجات والأسعار والمخزون من قاعدة البيانات، ويتحقق من صلاحية كل سطر، ' +
      'ثم يعيد snapshot بالأسعار المحسوبة على السيرفر (subtotal/discount/shipping/total). ' +
      'لا ينشئ Order ولا Payment ولا يغيّر quantity/reservedQuantity.',
  })
  @ApiResponse({ status: 200, description: 'canCheckout=true + snapshot كامل' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  @ApiResponse({
    status: 409,
    description: 'السلة فارغة · منتج غير نشط · مخزون غير كافٍ · كمية غير صالحة',
  })
  preview(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.checkout.preview(user.sub, requestMeta(req));
  }
}
