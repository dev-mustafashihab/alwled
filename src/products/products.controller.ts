import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user?: JwtPayload): ActorAccess | null =>
  user ? { id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [] } : null;

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'قائمة المنتجات (عام)',
    description:
      'عام: المنتجات النشطة فقط ضمن تصنيف وعلامة نشطين. الموظف الحامل لصلاحية products.read ' +
      'يمكنه includeInactive=true وisActive=false، وincludeInventory=true يتطلب inventory.read.',
  })
  @ApiResponse({ status: 200, description: 'items + meta { page, limit, total, totalPages }' })
  list(@Query() query: ListProductsQueryDto, @CurrentUser() user?: JwtPayload) {
    return this.products.list(query, actorOf(user));
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'تفاصيل منتج بالـslug (عام)' })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user?: JwtPayload) {
    return this.products.findBySlugOrId(slug, actorOf(user));
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل منتج بالمعرّف (عام) — صور + مواصفات + ملخّص مخزون للطاقم' })
  @ApiResponse({ status: 404, description: 'غير موجود أو غير منشور' })
  findOne(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.products.findBySlugOrId(id, actorOf(user));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @Permissions({ any: ['products.create'] })
  @ApiOperation({
    summary: 'إنشاء منتج (يتطلب products.create)',
    description: 'ينشئ المنتج + سجل مخزون ابتدائي (0) في transaction واحدة. لا تُقبل حقول المخزون من هنا.',
  })
  @ApiResponse({ status: 400, description: 'تصنيف/علامة غير صالحة أو سعر غير صحيح' })
  @ApiResponse({ status: 409, description: 'SKU أو slug مستخدم' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.products.create(dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @Permissions({ any: ['products.update'] })
  @ApiOperation({ summary: 'تعديل منتج (يتطلب products.update) — بدون تعديل المخزون' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.products.update(Number(id), dto, actorOf(user)!, meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @Permissions({ any: ['products.delete'] })
  @ApiOperation({
    summary: 'تعطيل منتج (soft delete افتراضياً)',
    description: 'hard=true مرفوض إذا وُجدت حركات مخزون — القيمة التاريخية محفوظة.',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard') hard: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.products.remove(id, actorOf(user)!, hard === 'true', meta(req));
  }
}
