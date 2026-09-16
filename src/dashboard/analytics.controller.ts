import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { TimeseriesQueryDto } from './dto/dashboard.dto';
import { JwtAuthGuard, Permissions } from '../common';

/**
 * Analytics — READ ONLY. `analytics.read` is separate from `dashboard.read`:
 * series aggregation is the more expensive surface, so access is granted
 * independently (OWNER via `*`, ADMIN explicitly seeded).
 */
@ApiTags('admin-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Permissions({ any: ['analytics.read'] })
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('timeseries')
  @ApiOperation({
    summary: 'سلسلة زمنية للطلبات والدفعات الناجحة (يتطلب analytics.read)',
    description:
      'تجميع UTC بـday/week/month. orderValue و succeededPaymentAmount قيمتان مختلفتان ' +
      'ولا تُجمعان معاً. الفواصل الفارغة تُعاد بأصفار. الحد الأقصى للمدى 366 يوماً.',
  })
  @ApiResponse({ status: 200, description: 'سلسلة زمنية + إجماليات (مبالغ كنص)' })
  @ApiResponse({ status: 400, description: 'مدى غير صالح (from >= to أو أكبر من 366 يوماً)' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  @ApiResponse({ status: 403, description: 'بدون صلاحية analytics.read' })
  timeseries(@Query() query: TimeseriesQueryDto) {
    return this.analytics.timeseries(query);
  }
}
