import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit.query.dto';
import { JwtAuthGuard, Permissions } from '../common';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions({ any: ['audit.read'] })
  @ApiOperation({ summary: 'سجل التدقيق (صفحات + فلاتر) — يتطلب audit.read' })
  @ApiResponse({ status: 200, description: 'قائمة أحداث التدقيق' })
  @ApiResponse({ status: 403, description: 'صلاحيات غير كافية' })
  list(@Query() query: ListAuditQueryDto) {
    return this.audit.list(query);
  }
}
