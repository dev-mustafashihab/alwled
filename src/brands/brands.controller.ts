import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user?: JwtPayload): ActorAccess | null =>
  user ? { id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [] } : null;

@ApiTags('brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'قائمة العلامات التجارية (عام)',
    description: 'عام: النشطة فقط — الحامل لصلاحية brands.read يمكنه includeInactive=true.',
  })
  list(@Query() query: ListBrandsQueryDto, @CurrentUser() user?: JwtPayload) {
    return this.brands.list(query, actorOf(user));
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'تفاصيل علامة تجارية بالمعرّف أو الـslug (عام)' })
  findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: JwtPayload) {
    return this.brands.findBySlugOrId(idOrSlug, actorOf(user));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @Permissions({ any: ['brands.create'] })
  @ApiOperation({ summary: 'إنشاء علامة تجارية (يتطلب brands.create)' })
  @ApiResponse({ status: 409, description: 'الاسم أو الـslug مستخدم' })
  create(@Body() dto: CreateBrandDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.brands.create(dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @Permissions({ any: ['brands.update'] })
  @ApiOperation({ summary: 'تعديل علامة تجارية (يتطلب brands.update)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.brands.update(id, dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @Permissions({ any: ['brands.delete'] })
  @ApiOperation({ summary: 'تعطيل علامة تجارية (soft) — hard=true للحذف النهائي إن لم تُستخدم' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard') hard: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.brands.remove(id, actorOf(user)!, hard === 'true', meta(req));
  }
}
