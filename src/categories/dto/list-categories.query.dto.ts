import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min,
} from 'class-validator';

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ description: 'بحث بالاسم أو الـslug' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'التصفية حسب التصنيف الأب' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  parentId?: number;

  @ApiPropertyOptional({ description: 'true = التصنيفات الرئيسية فقط' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  rootsOnly?: boolean;

  @ApiPropertyOptional({ description: 'يتطلب صلاحية categories.read — يعرض غير النشِط أيضاً' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ description: 'يعيد الشجرة متداخلة (حتى 3 مستويات)' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  tree?: boolean;

  @ApiPropertyOptional({ enum: ['sortOrder', 'name', 'createdAt'], default: 'sortOrder' })
  @IsOptional() @IsIn(['sortOrder', 'name', 'createdAt'])
  sortBy: string = 'sortOrder';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
