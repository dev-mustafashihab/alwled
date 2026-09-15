import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class AdminListOrdersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED'])
  status?: OrderStatus;

  @ApiPropertyOptional({ example: 'ORD-2026-000001' })
  @IsOptional() @IsString() @MaxLength(40)
  orderNumber?: string;

  @ApiPropertyOptional({ description: 'تصفية حسب العميل' })
  @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional() @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59.000Z' })
  @IsOptional() @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'total', 'status'], default: 'createdAt' })
  @IsOptional() @IsIn(['createdAt', 'total', 'status'])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
