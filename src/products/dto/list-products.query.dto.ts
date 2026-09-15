import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';

export class ListProductsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'بحث بالاسم / SKU / slug / الوصف المختصر' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  brandId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'يتطلب products.read — للتصفية على غير النشط أيضاً' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'يتطلب products.read' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 900 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'إضافة ملخّص المخزون للقائمة (يتطلب inventory.read)' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeInventory?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'price', 'name', 'updatedAt'], default: 'createdAt' })
  @IsOptional() @IsIn(['createdAt', 'price', 'name', 'updatedAt'])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
