import {
  Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { requestMeta } from '../common/types/request-meta';
import { RATE_LIMITS } from '../common/constants';
import { actorFromPayload, hasPermission } from '../common/utils/permissions.util';

/**
 * Customer-facing orders. JWT is mandatory; the customer id always comes from the
 * token, and another customer's order is reported as 404 (never 403) so its
 * existence is not leaked.
 */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: RATE_LIMITS.orders.max, ttl: RATE_LIMITS.orders.window * 1000 } })
  @ApiOperation({
    summary: 'إنشاء طلب من السلة (Idempotency-Key إلزامي)',
    description:
      'ينشئ الطلب من سلة المستخدم الحالية داخل transaction واحدة: قفل صفوف المخزون (FOR UPDATE) → ' +
      'التحقق من النشاط والتوفر → snapshot للمنتج والسعر → إنشاء الطلب وعناصره → حجز المخزون ' +
      '(reservedQuantity) وتسجيل حركة RESERVATION → تفريغ السلة → idempotency. ' +
      'أي فشل = rollback كامل (لا طلب جزئي، لا حجز، والسلة كما هي). ' +
      'لا يقبل أي أسعار أو كميات أو userId من العميل.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'مفتاح فريد لكل عملية إنشاء (6-128 حرفاً). إعادة الإرسال بنفس المفتاح تُعيد نفس الطلب.',
  })
  @ApiResponse({ status: 201, description: 'تم إنشاء الطلب (أو أُعيد الطلب السابق لنفس المفتاح)' })
  @ApiResponse({ status: 400, description: 'حقول غير مسموحة في الـbody أو ترويسة مفقودة' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  @ApiResponse({
    status: 409,
    description: 'سلة فارغة · منتج غير نشط · مخزون غير كافٍ · مفتاح مكرر بطلب مختلف',
  })
  async create(
    @Body() _body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.orders.create(user.sub, idempotencyKey, requestMeta(req));
    return { ...(result.order as object), idempotentReplay: result.replayed };
  }

  @Get()
  @ApiOperation({
    summary: 'طلبات المستخدم الحالي (صفحات)',
    description: 'لا يقبل userId — الطلبات تُفلتر من التوكن. القائمة تعيد ملخّصاً بلا عناصر.',
  })
  @ApiResponse({ status: 200, description: 'items + meta { page, limit, total, totalPages }' })
  list(@Query() query: ListOrdersQueryDto, @CurrentUser() user: JwtPayload) {
    return this.orders.listMine(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل طلب يخص المستخدم الحالي (مع عناصره)' })
  @ApiResponse({ status: 404, description: 'غير موجود أو يخص مستخدماً آخر' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.orders.findOne(id, {
      id: user.sub,
      isStaff: hasPermission(actorFromPayload(user), 'orders.read'),
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'إلغاء الطلب (العميل: PENDING فقط)',
    description:
      'يحجز الصف FOR UPDATE ثم: يحرّر الحجز (reservedQuantity -= qty)، يسجّل حركة RELEASE، ' +
      'ويضع status=CANCELLED مع cancelledAt والسبب. quantity لا تُنقص أبداً (لا بيع في هذه المرحلة). ' +
      'إلغاء مزدوج = 409 ولا يحدث تحرير مرتين.',
  })
  @ApiResponse({ status: 200, description: 'الطلب بعد الإلغاء' })
  @ApiResponse({ status: 404, description: 'غير موجود أو يخص مستخدماً آخر' })
  @ApiResponse({ status: 409, description: 'ملغى مسبقاً أو الحالة لا تسمح بالإلغاء' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.orders.cancel(id, { id: user.sub, isStaff: false }, dto.reason, requestMeta(req));
  }
}
