import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/products/demo-1.webp' })
  @IsString() @MaxLength(512)
  url!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  altText?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false, description: 'أول صورة تصبح Primary تلقائياً' })
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateProductImageDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(512)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}

export class ReorderImagesItemDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  id!: number;

  @ApiProperty({ example: 0 })
  @Type(() => Number) @IsInt() @Min(0)
  sortOrder!: number;
}

export class ReorderProductImagesDto {
  @ApiProperty({ type: [ReorderImagesItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayUnique((i: ReorderImagesItemDto) => i.id)
  images!: ReorderImagesItemDto[];
}
