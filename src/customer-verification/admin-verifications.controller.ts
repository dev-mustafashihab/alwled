import {
  Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomerVerificationService } from './customer-verification.service';
import { ListVerificationsQueryDto, RejectVerificationDto } from './dto/verification.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import { requestMeta } from '../common/types/request-meta';

/**
 * Staff verification queue. A JWT alone grants nothing: verification.read /
 * verification.update are required through the existing permission system.
 *
 * The only way a customer becomes VERIFIED here is an explicit employee decision,
 * recorded as source=MANUAL — never presented as provider verification.
 */
@ApiTags('admin-verifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/verifications')
export class AdminVerificationsController {
  constructor(private readonly verifications: CustomerVerificationService) {}

  @Get()
  @Permissions({ any: ['verification.read'] })
  @ApiOperation({
    summary: 'طابور التحقق (يتطلب verification.read)',
    description: 'فلاتر: page, limit, status, userId + sort. لا استعلام بلا صفحات.',
  })
  @ApiResponse({ status: 403, description: 'بدون صلاحية verification.read' })
  list(@Query() query: ListVerificationsQueryDto) {
    return this.verifications.adminList(query);
  }

  @Get(':id')
  @Permissions({ any: ['verification.read'] })
  @ApiOperation({ summary: 'تفاصيل طلب تحقق (يتطلب verification.read)' })
  @ApiResponse({ status: 404, description: 'الطلب غير موجود' })
  findOne(@Param('id') id: string) {
    return this.verifications.adminFindOne(id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @Permissions({ any: ['verification.update'] })
  @ApiOperation({
    summary: 'بدء المراجعة (يتطلب verification.update)',
    description: 'PENDING → IN_REVIEW مع تسجيل الموظف ووقت المراجعة.',
  })
  @ApiResponse({ status: 409, description: 'الحالة لا تسمح ببدء المراجعة' })
  review(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.verifications.review(id, { id: user.sub, isStaff: true }, requestMeta(req));
  }

  @Post(':id/verify')
  @HttpCode(200)
  @Permissions({ any: ['verification.update'] })
  @ApiOperation({
    summary: 'تأكيد التحقق يدوياً (يتطلب verification.update)',
    description:
      'IN_REVIEW → VERIFIED بقرار موظف، ويُسجَّل source=MANUAL صراحةً — ' +
      'لا يُدّعى أي تحقق من مزوّد خارجي. يوجد قيد قاعدة بيانات يمنع VERIFIED بلا إتمام.',
  })
  @ApiResponse({ status: 200, description: 'الطلب بعد التأكيد' })
  @ApiResponse({ status: 409, description: 'الحالة لا تسمح بالتأكيد' })
  verify(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.verifications.verify(id, { id: user.sub, isStaff: true }, requestMeta(req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Permissions({ any: ['verification.update'] })
  @ApiOperation({
    summary: 'رفض الطلب بسبب إلزامي (يتطلب verification.update)',
    description: 'IN_REVIEW → REJECTED + السبب. العميل يستطيع إعادة المحاولة بعد الرفض.',
  })
  @ApiResponse({ status: 400, description: 'السبب مفقود أو قصير' })
  @ApiResponse({ status: 409, description: 'الحالة لا تسمح بالرفض' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectVerificationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.verifications.reject(id, { id: user.sub, isStaff: true }, dto.reason, requestMeta(req));
  }
}
