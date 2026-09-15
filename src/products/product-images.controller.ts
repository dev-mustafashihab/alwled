import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ProductImagesService } from './product-images.service';
import {
  CreateProductImageDto, ReorderProductImagesDto, UpdateProductImageDto,
} from './dto/product-image.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user: JwtPayload): ActorAccess => ({
  id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [],
});

@ApiTags('product-images')
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'صور المنتج (عام) — الصورة الأساسية أولاً' })
  list(@Param('productId', ParseIntPipe) productId: number) {
    return this.images.list(productId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @Permissions({ any: ['products.update'] })
  @ApiOperation({
    summary: 'إضافة صورة (يتطلب products.update)',
    description: 'الرابط يُمرَّر عبر Storage abstraction (حالياً URL فقط، لاحقاً S3/Cloudinary).',
  })
  @ApiResponse({ status: 400, description: 'رابط غير صالح' })
  add(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateProductImageDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.images.add(productId, dto, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('reorder')
  @Permissions({ any: ['products.update'] })
  @ApiOperation({ summary: 'إعادة ترتيب الصور (يتطلب products.update)' })
  reorder(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: ReorderProductImagesDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.images.reorder(productId, dto, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':imageId')
  @Permissions({ any: ['products.update'] })
  @ApiOperation({ summary: 'تعديل صورة (يتطلب products.update)' })
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.images.update(productId, imageId, dto, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':imageId/primary')
  @Permissions({ any: ['products.update'] })
  @ApiOperation({ summary: 'تعيين الصورة الأساسية — صورة أساسية واحدة كحد أقصى' })
  setPrimary(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.images.setPrimary(productId, imageId, actorOf(user), meta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':imageId')
  @Permissions({ any: ['products.update'] })
  @ApiOperation({ summary: 'حذف صورة (يتطلب products.update)' })
  remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.images.remove(productId, imageId, actorOf(user), meta(req));
  }
}
