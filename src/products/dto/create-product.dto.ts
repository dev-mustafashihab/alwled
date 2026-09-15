import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'منتج تجريبي' })
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'demo-product', description: 'يُولَّد من الاسم إذا لم يُرسل' })
  @IsOptional() @IsString() @MaxLength(220)
  slug?: string;

  @ApiPropertyOptional({ example: 'REF-DEMO-001', description: 'يُولَّد تلقائياً إذا لم يُرسل' })
  @IsOptional() @IsString() @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(20000)
  description?: string;

  @ApiProperty({ example: 500, minimum: 0, description: 'NUMERIC(12,2) — لا كسور عشرية عائمة' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 600, description: 'يجب أن يكون ≥ price عند وجوده' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  compareAtPrice?: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  brandId!: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  categoryId!: number;

  @ApiPropertyOptional({ default: true, description: 'النشر يتطلب تصنيفاً وعلامة نشطين' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isFeatured?: boolean;
}
