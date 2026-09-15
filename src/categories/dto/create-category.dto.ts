import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'الثلاجات' })
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'refrigerators', description: 'يُولَّد تلقائياً من الاسم إذا لم يُرسل' })
  @IsOptional() @IsString() @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '/assets/categories/refrigerators.webp' })
  @IsOptional() @IsString() @MaxLength(512)
  image?: string;

  @ApiPropertyOptional({ example: 1, description: 'التصنيف الأب (Self-reference)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  parentId?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
