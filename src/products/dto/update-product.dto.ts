import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';

/** id / createdAt / inventory are intentionally NOT updatable here. */
export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(220)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(20000)
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: '≥ price — أو null لإزالته' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  compareAtPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  brandId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isFeatured?: boolean;
}
