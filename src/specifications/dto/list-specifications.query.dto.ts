import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListSpecificationsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] })
  @IsOptional() @IsIn(['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ description: 'يتطلب specifications.read' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeInactive?: boolean;
}
