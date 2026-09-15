import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRolesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ description: 'بحث بالاسم' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'أدوار النظام فقط أو المخصصة فقط' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional({ enum: ['createdAt', 'name'], default: 'name' })
  @IsOptional() @IsIn(['createdAt', 'name'])
  sortBy: string = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
