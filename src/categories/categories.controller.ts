import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user?: JwtPayload): ActorAccess | null =>
  user ? { id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [] } : null;

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'قائمة التصنيفات (عام)',
    description:
      'عام: يعرض التصنيفات النشطة فقط. الموظف الحامل لصلاحية categories.read ' +
      'يمكنه تمرير includeInactive=true لرؤية غير النشط.',
  })
  @ApiQuery({ name: 'tree', required: false, description: 'يعيد الشجرة متداخلة' })
  @ApiResponse({ status: 200, description: 'قائمة التصنيفات + meta' })
  list(@Query() query: ListCategoriesQueryDto, @CurrentUser() user?: JwtPayload) {
    return this.categories.list(query, actorOf(user));
  }

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'تفاصيل تصنيف بالمعرّف أو الـslug (عام)' })
  @ApiResponse({ status: 404, description: 'غير موجود أو غير نشط' })
  findOne(@Param('idOrSlug') idOrSlug: string, @CurrentUser() user?: JwtPayload) {
    return this.categories.findBySlugOrId(idOrSlug, actorOf(user));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @Permissions({ any: ['categories.create'] })
  @ApiOperation({ summary: 'إنشاء تصنيف (يتطلب categories.create)' })
  @ApiResponse({ status: 409, description: 'الـslug مستخدم' })
  @ApiResponse({ status: 400, description: 'تصنيف أب غير صالح أو عمق زائد' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.categories.create(dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @Permissions({ any: ['categories.update'] })
  @ApiOperation({ summary: 'تعديل تصنيف (يتطلب categories.update) — حماية من الحلقات الدائرية' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.categories.update(id, dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @Permissions({ any: ['categories.delete'] })
  @ApiOperation({
    summary: 'حذف تصنيف (افتراضياً Soft Delete = isActive:false)',
    description: 'hard=true للحذف النهائي — مرفوض إذا كان هناك منتجات أو تصنيفات فرعية.',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard') hard: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.categories.remove(id, actorOf(user)!, hard === 'true', meta(req));
  }
}
