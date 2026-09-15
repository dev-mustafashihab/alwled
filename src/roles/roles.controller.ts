import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { ListRolesQueryDto } from './dto/list-roles.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user: JwtPayload): ActorAccess => ({
  id: user.sub,
  roles: user.roles ?? [],
  permissions: user.permissions ?? [],
});

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions({ any: ['roles.read'] })
  @ApiOperation({ summary: 'قائمة الأدوار مع عدد المستخدمين والصلاحيات' })
  list(@Query() query: ListRolesQueryDto) {
    return this.roles.list(query);
  }

  @Get(':id')
  @Permissions({ any: ['roles.read'] })
  @ApiOperation({ summary: 'تفاصيل دور: الصلاحيات + عدد المستخدمين (بدون N+1)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roles.findOne(id);
  }

  @Post()
  @Permissions({ any: ['roles.create'] })
  @ApiOperation({ summary: 'إنشاء دور مخصص (SALES, PRODUCT_MANAGER, ...)' })
  @ApiResponse({ status: 403, description: 'محاولة منح صلاحيات لا تملكها' })
  @ApiResponse({ status: 409, description: 'الاسم محجوز أو مستخدم' })
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.roles.create(dto, actorOf(user), meta(req));
  }

  @Patch(':id')
  @Permissions({ any: ['roles.update'] })
  @ApiOperation({ summary: 'تعديل وصف دور' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, actorOf(user), meta(req));
  }

  @Delete(':id')
  @Permissions({ any: ['roles.delete'] })
  @ApiOperation({ summary: 'حذف دور مخصص (غير مرتبط بمستخدمين)' })
  @ApiResponse({ status: 409, description: 'الدور مُسند لمستخدمين' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.roles.remove(id, actorOf(user), meta(req));
  }

  @Put(':id/permissions')
  @Permissions({ any: ['roles.update'] })
  @ApiOperation({ summary: 'استبدال صلاحيات الدور (عملية ذرّية)' })
  setPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.roles.setPermissions(id, dto, actorOf(user), meta(req));
  }
}
