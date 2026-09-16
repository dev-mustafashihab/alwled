import {
  Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomerVerificationService } from './customer-verification.service';
import { StartVerificationDto } from './dto/verification.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { requestMeta } from '../common/types/request-meta';
import { RATE_LIMITS } from '../common/constants';

/**
 * Customer verification endpoints. The user id always comes from the access token —
 * no body/query field can select a user, a status or a provider reference.
 *
 * There is deliberately no endpoint that can mark a customer VERIFIED: only an
 * employee decision (recorded as MANUAL) reaches that state in Stage 9.
 */
@ApiTags('verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(private readonly verifications: CustomerVerificationService) {}

  @Get('me')
  @ApiOperation({
    summary: 'حالة التحقق الخاصة بالمستخدم الحالي',
    description:
      'يعيد NOT_STARTED (حالة افتراضية غير مخزَّنة) إذا لم يبدأ المستخدم أي طلب. ' +
      'الانتهاء (EXPIRED) يُحتسب عند القراءة إذا مرّ الموعد.',
  })
  @ApiResponse({ status: 200, description: 'الحالة + canStart/canCancel/isVerified' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  me(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.verifications.getMine(user.sub, requestMeta(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'طلب تحقق يخص المستخدم الحالي فقط (غير ذلك 404)' })
  @ApiResponse({ status: 404, description: 'غير موجود أو يخص مستخدماً آخر' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.verifications.findOneForCustomer(id, user.sub);
  }

  @Post('start')
  @Throttle({ default: { limit: RATE_LIMITS.verificationStart.max, ttl: RATE_LIMITS.verificationStart.window * 1000 } })
  @ApiOperation({
    summary: 'بدء طلب تحقق (Idempotency-Key إلزامي)',
    description:
      'ينشئ طلباً بحالة PENDING ويسلّمه لطابور المراجعة. ' +
      'يُرفض بـ409 إذا كان هناك طلب نشط، أو الحساب موثَّق، أو الطلب ملغى. ' +
      'إعادة المحاولة مسموحة من REJECTED وEXPIRED. ' +
      'المزوّد الحالي داخلي (LOG) ولا يجعل الحساب VERIFIED.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'مفتاح فريد لكل عملية بدء' })
  @ApiResponse({ status: 201, description: 'الطلب (أو الطلب الأصلي عند إعادة الإرسال بنفس المفتاح)' })
  @ApiResponse({ status: 400, description: 'حقول غير مسموحة (userId/status/providerReference)' })
  @ApiResponse({ status: 409, description: 'طلب نشط موجود · حساب موثَّق · طلب ملغى · مفتاح مختلف المحتوى' })
  @ApiResponse({ status: 429, description: 'تجاوز حد المحاولات' })
  start(
    @Body() dto: StartVerificationDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.verifications.start(user.sub, idempotencyKey, dto, requestMeta(req));
  }

  @Post('cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: RATE_LIMITS.verificationCancel.max, ttl: RATE_LIMITS.verificationCancel.window * 1000 } })
  @ApiOperation({
    summary: 'إلغاء طلب التحقق الحالي',
    description:
      'PENDING أو IN_REVIEW → CANCELLED. لا يمكن الإلغاء من VERIFIED/REJECTED/EXPIRED، ' +
      'وCANCELLED نهائية وفق آلة الحالة الحالية.',
  })
  @ApiResponse({ status: 200, description: 'الطلب بعد الإلغاء' })
  @ApiResponse({ status: 404, description: 'لا يوجد طلب تحقق' })
  @ApiResponse({ status: 409, description: 'الحالة الحالية لا تسمح بالإلغاء' })
  cancel(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.verifications.cancel(user.sub, requestMeta(req));
  }
}
