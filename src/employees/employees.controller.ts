import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListEmployeesQueryDto } from './dto/list-employees.query.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user: JwtPayload): ActorAccess => ({
  id: user.sub,
  roles: user.roles ?? [],
  permissions: user.permissions ?? [],
});

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  @Permissions({ any: ['employees.create'] })
  @ApiOperation({ summary: 'إنشاء موظف (افتراضياً بدور EMPLOYEE)' })
  @ApiResponse({ status: 403, description: 'محاولة إنشاء ADMIN أو منح صلاحيات أعلى من صلاحياتك' })
  @ApiResponse({ status: 409, description: 'البريد أو الهاتف مستخدم مسبقاً' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.employees.create(dto, actorOf(user), meta(req));
  }

  @Get()
  @Permissions({ any: ['employees.read'] })
  @ApiOperation({ summary: 'قائمة الموظفين (صفحات + بحث + فلاتر + فرز)' })
  list(@Query() query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  @Get(':id')
  @Permissions({ any: ['employees.read'] })
  @ApiOperation({ summary: 'تفاصيل موظف + الصلاحيات الفعلية + عدد الجلسات (بدون N+1)' })
  findOne(@Param('id') id: string) {
    return this.employees.findOne(id);
  }

  @Patch(':id')
  @Permissions({ any: ['employees.update'] })
  @ApiOperation({ summary: 'تعديل بيانات موظف' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.employees.update(id, dto, actorOf(user), meta(req));
  }

  @Patch(':id/status')
  @Permissions({ any: ['employees.update'] })
  @ApiOperation({ summary: 'تفعيل/تعطيل موظف (التعطيل يلغي جلساته)' })
  @ApiResponse({ status: 403, description: 'آخر مالك — أو تعديل حساب مالك من غير المالك' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.employees.setStatus(id, dto.isActive, actorOf(user), meta(req));
  }

  @Post(':id/roles')
  @Permissions({ any: ['employees.update'] })
  @ApiOperation({ summary: 'إسناد دور لموظف (يدعم أدواراً متعددة)' })
  @ApiResponse({ status: 403, description: 'رفع صلاحيات ذاتي أو منح دور أعلى من صلاحياتك' })
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.employees.assignRole(id, dto, actorOf(user), meta(req));
  }

  @Delete(':id/roles/:roleId')
  @Permissions({ any: ['employees.update'] })
  @ApiOperation({ summary: 'سحب دور من موظف (لا يترك الحساب بلا أدوار)' })
  revokeRole(
    @Param('id') id: string,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.employees.revokeRole(id, roleId, actorOf(user), meta(req));
  }
}
