import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListBrandsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'يتطلب brands.read' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ enum: ['sortOrder', 'name', 'createdAt'], default: 'sortOrder' })
  @IsOptional() @IsIn(['sortOrder', 'name', 'createdAt'])
  sortBy: string = 'sortOrder';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
