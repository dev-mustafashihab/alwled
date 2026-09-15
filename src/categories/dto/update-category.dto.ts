import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(512)
  image?: string;

  @ApiPropertyOptional({ description: 'null لتحويله لتصنيف رئيسي' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  parentId?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
