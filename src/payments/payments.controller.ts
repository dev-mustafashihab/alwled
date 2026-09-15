import {
  Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { requestMeta } from '../common/types/request-meta';
import { RATE_LIMITS } from '../common/constants';
import { actorFromPayload, hasPermission } from '../common/utils/permissions.util';

/**
 * Customer payments. JWT only (a payment belongs to its owner); the user id always
 * comes from the token.
 *
 * There is deliberately NO endpoint that can mark a payment SUCCEEDED: reaching
 * that state requires a verified provider result in a later stage.
 */
@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Throttle({ default: { limit: RATE_LIMITS.orders.max, ttl: RATE_LIMITS.orders.window * 1000 } })
  @ApiOperation({
    summary: 'إنشاء دفعة PENDING لطلب يخص المستخدم الحالي',
    description:
      'المبلغ والعملة يُقرآن من الطلب (Order.total / Order.currency) — لا تُقبل من العميل. ' +
      'الحالة الابتدائية PENDING دائماً. لا تعدّل المخزون ولا السلة ولا snapshots الطلب. ' +
      'لا يوجد أي اتصال بمزوّد دفع في هذه المرحلة (provider/providerPaymentId = null).',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'مفتاح فريد لكل عملية إنشاء دفعة (حتى 128 حرفاً) — إعادة الإرسال تُعيد نفس الدفعة.',
  })
  @ApiResponse({ status: 201, description: 'الدفعة (أو الدفعة الأصلية عند إعادة الإرسال بنفس المفتاح)' })
  @ApiResponse({ status: 400, description: 'حقول غير مسموحة (amount/currency/status/userId/provider)' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  @ApiResponse({ status: 404, description: 'الطلب غير موجود أو يخص مستخدماً آخر' })
  @ApiResponse({ status: 409, description: 'طلب ملغى · دفعة مسبقة للطلب · مفتاح مكرر بمحتوى مختلف' })
  async create(
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const result = await this.payments.create(user.sub, idempotencyKey, dto, requestMeta(req));
    return { ...result.payment, idempotentReplay: result.replayed };
  }

  @Get()
  @ApiOperation({ summary: 'دفعات المستخدم الحالي (صفحات + فلترة status/method)' })
  @ApiResponse({ status: 200, description: 'items + meta { page, limit, total, totalPages }' })
  list(@Query() query: ListPaymentsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.payments.listMine(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل دفعة تخص المستخدم الحالي' })
  @ApiResponse({ status: 404, description: 'غير موجودة أو تخص مستخدماً آخر' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.findOne(id, {
      id: user.sub,
      isStaff: hasPermission(actorFromPayload(user), 'payments.read'),
    });
  }
}
