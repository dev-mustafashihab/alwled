import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListInventoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'بحث بالاسم أو SKU' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'المخزون المنخفض فقط (quantity ≤ lowStockThreshold)' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  lowStockOnly?: boolean;

  @ApiPropertyOptional({ description: 'المنتجات بنفاد تام (available = 0)' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  outOfStockOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  brandId?: number;

  @ApiPropertyOptional({ enum: ['quantity', 'updatedAt', 'productName'], default: 'updatedAt' })
  @IsOptional() @IsIn(['quantity', 'updatedAt', 'productName'])
  sortBy: string = 'updatedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
