import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AdminListNotificationsQueryDto, ProcessOutboxDto } from './dto/notifications.dto';
import { JwtAuthGuard, Permissions } from '../common';

/**
 * Staff notification queue (operational alerts). Requires the dedicated
 * permission `notifications.admin.read` — a JWT alone grants nothing, and the
 * customer inbox stays separate: an admin reading here does not gain access to
 * /notifications/:id of another user.
 */
@ApiTags('admin-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Permissions({ any: ['notifications.admin.read'] })
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'طابور إشعارات الإدارة (يتطلب notifications.admin.read)',
    description: 'فلاتر: type/read/from/to/userId · صفحات محدودة (≤50) · ترتيب createdAt.',
  })
  @ApiResponse({ status: 403, description: 'بدون صلاحية notifications.admin.read' })
  list(@Query() query: AdminListNotificationsQueryDto) {
    return this.notifications.adminList(query, query.userId);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'ملخّص تشغيلي (عدد الإجمالي/غير المقروء/حسب النوع)',
    description: 'أرقام من قاعدة البيانات مباشرة (COUNT/GROUP BY).',
  })
  summary() {
    return this.notifications.adminSummary();
  }

  @Post('outbox/process')
  @ApiOperation({
    summary: 'معالجة صندوق الصادر يدوياً (Bounded)',
    description:
      'يعالج دفعة محدودة من أحداث الإشعارات المعلّقة. لا worker خارجي ولا queue — ' +
      'المعالجة تتم داخل التطبيق.',
  })
  process(@Query() query: ProcessOutboxDto) {
    return this.notifications.processOutbox(query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل إشعار (يتطلب notifications.admin.read)' })
  @ApiResponse({ status: 404, description: 'الإشعار غير موجود' })
  findOne(@Param('id') id: string) {
    return this.notifications.adminFindOne(id);
  }
}
