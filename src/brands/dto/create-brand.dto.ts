import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBrandDto {
  @ApiProperty({ example: 'علامة تجريبية' })
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'demo-brand', description: 'يُولَّد تلقائياً من الاسم' })
  @IsOptional() @IsString() @MaxLength(140)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '/assets/brands/demo.png' })
  @IsOptional() @IsString() @MaxLength(512)
  logo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
