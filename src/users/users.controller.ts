import {
  Body, Controller, Get, Param, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'بيانات المستخدم الحالي' })
  me(@CurrentUser('sub') userId: string) {
    return this.users.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'تعديل الملف الشخصي (الاسم/اللقب/الهاتف فقط)' })
  @ApiResponse({ status: 400, description: 'لا يوجد حقول قابلة للتعديل' })
  @ApiResponse({ status: 409, description: 'الهاتف مستخدم مسبقاً' })
  updateMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.users.updateProfile(userId, dto, meta(req));
  }

  @Get()
  @Permissions({ any: ['users.read', 'employees.read'] })
  @ApiOperation({ summary: 'قائمة المستخدمين (صفحات + بحث + فلاتر + فرز)' })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @Permissions({ any: ['users.read', 'employees.read'] })
  @ApiOperation({ summary: 'تفاصيل مستخدم (بدون أي بيانات حساسة)' })
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Patch(':id/status')
  @Permissions({ any: ['users.update', 'employees.update'] })
  @ApiOperation({ summary: 'تفعيل/تعطيل مستخدم (تعطيله يلغي جلساته)' })
  @ApiResponse({ status: 403, description: 'صلاحيات غير كافية لتعديل حساب إداري' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return this.users.setStatus(
      id,
      dto.isActive,
      { id: actor.sub, roles: actor.roles },
      meta(req),
    );
  }
}
