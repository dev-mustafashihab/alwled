import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SpecificationsService } from './specifications.service';
import { CreateSpecificationDefinitionDto } from './dto/create-specification.dto';
import { UpdateSpecificationDefinitionDto } from './dto/update-specification.dto';
import { ListSpecificationsQueryDto } from './dto/list-specifications.query.dto';
import { SetProductSpecificationsDto } from './dto/product-specifications.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user: JwtPayload): ActorAccess => ({
  id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [],
});

@ApiTags('specifications')
@Controller('specifications')
export class SpecificationsController {
  constructor(private readonly specs: SpecificationsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'قائمة تعريفات المواصفات (عام)',
    description: 'Capacity (NUMBER/L), Color (SELECT), No Frost (BOOLEAN) ... — إضافة مواصفة لا تعدّل جدول المنتجات.',
  })
  list(@Query() query: ListSpecificationsQueryDto, @CurrentUser() user?: JwtPayload) {
    return this.specs.list(query, user ? actorOf(user) : null);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل تعريف مواصفة (عام)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.specs.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @Permissions({ any: ['specifications.create'] })
  @ApiOperation({ summary: 'إنشاء تعريف مواصفة (يتطلب specifications.create)' })
  @ApiResponse({ status: 409, description: 'المفتاح مستخدم' })
  create(@Body() dto: CreateSpecificationDefinitionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.specs.create(dto, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @Permissions({ any: ['specifications.update'] })
  @ApiOperation({ summary: 'تعديل تعريف مواصفة (يتطلب specifications.update)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecificationDefinitionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.specs.update(id, dto, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @Permissions({ any: ['specifications.delete'] })
  @ApiOperation({ summary: 'تعطيل تعريف مواصفة (soft) — hard=true إن لم تُستخدم' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('hard') hard: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.specs.remove(id, actorOf(user), hard === 'true', meta(req));
  }
}

@ApiTags('product-specifications')
@Controller('products/:productId/specifications')
export class ProductSpecificationsController {
  constructor(private readonly specs: SpecificationsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'مواصفات منتج (عام) — القيمة مفصولة عن الوحدة' })
  list(@Param('productId', ParseIntPipe) productId: number) {
    return this.specs.listForProduct(productId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put()
  @Permissions({ any: ['products.update'] })
  @ApiOperation({
    summary: 'استبدال مواصفات المنتج بالكامل (يتطلب products.update)',
    description: 'عملية ذرّية داخل transaction — لا تُترك المنتجات في حالة نصف محدّثة.',
  })
  @ApiResponse({ status: 400, description: 'قيمة لا تطابق نوع المواصفة أو مواصفة غير موجودة' })
  replace(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: SetProductSpecificationsDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.specs.replaceForProduct(productId, dto, actorOf(user), meta(req));
  }
}
