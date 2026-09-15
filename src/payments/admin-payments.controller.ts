import {
  Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { AdminListPaymentsQueryDto } from './dto/admin-list-payments.query.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import { requestMeta } from '../common/types/request-meta';

/**
 * Staff payment management. A JWT alone grants nothing: `payments.read` /
 * `payments.update` are required through the existing permission system.
 *
 * No generic PATCH /status route exists on purpose — a payment can only be
 * cancelled here; SUCCEEDED/FAILED will come from a verified provider result.
 */
@ApiTags('admin-payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Permissions({ any: ['payments.read'] })
  @ApiOperation({
    summary: 'كل الدفعات (يتطلب payments.read)',
    description: 'فلاتر: page, limit, status, method, orderId, userId + sort. لا استعلام بلا صفحات.',
  })
  @ApiResponse({ status: 403, description: 'بدون صلاحية payments.read' })
  list(@Query() query: AdminListPaymentsQueryDto) {
    return this.payments.adminList(query);
  }

  @Get(':id')
  @Permissions({ any: ['payments.read'] })
  @ApiOperation({ summary: 'تفاصيل أي دفعة (يتطلب payments.read)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.payments.findOne(id, { id: user.sub, isStaff: true });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions({ any: ['payments.update'] })
  @ApiOperation({
    summary: 'إلغاء دفعة (يتطلب payments.update)',
    description:
      'الانتقالات المسموحة: PENDING→CANCELLED وPROCESSING→CANCELLED فقط. ' +
      'لا يمكن إلغاء دفعة SUCCEEDED/FAILED، ولا دفعة لها providerPaymentId (مسار المزوّد). ' +
      'قفل صف يمنع الإلغاء المزدوج، ولا يمكن لهذا المسار تعليم دفعة كـSUCCEEDED.',
  })
  @ApiResponse({ status: 200, description: 'الدفعة بعد الإلغاء' })
  @ApiResponse({ status: 403, description: 'بدون صلاحية payments.update' })
  @ApiResponse({ status: 404, description: 'الدفعة غير موجودة' })
  @ApiResponse({ status: 409, description: 'انتقال غير مسموح أو دفعة مرتبطة بمزوّد' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.payments.cancel(id, { id: user.sub, isStaff: true }, dto.reason, requestMeta(req));
  }
}
