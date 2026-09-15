import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard, Permissions } from '../common';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly perms: PermissionsService) {}

  @Get()
  @Permissions({ any: ['permissions.read'] })
  @ApiOperation({ summary: 'قائمة الصلاحيات مجمّعة حسب الوحدة (products/orders/roles/...)' })
  @ApiResponse({ status: 403, description: 'صلاحيات غير كافية — يتطلب permissions.read' })
  list() {
    return this.perms.grouped();
  }
}
