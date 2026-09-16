import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { PAYMENT_STATUS_VALUES, SUPPORTED_PAYMENT_METHODS } from '../payments.constants';

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: PaymentStatus, description: 'PENDING | PENDING_REVIEW | PROCESSING | SUCCEEDED | FAILED | CANCELLED' })
  @IsOptional() @IsIn(PAYMENT_STATUS_VALUES)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: SUPPORTED_PAYMENT_METHODS })
  @IsOptional() @IsIn(SUPPORTED_PAYMENT_METHODS as unknown as string[])
  method?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'amount', 'status'], default: 'createdAt' })
  @IsOptional() @IsIn(['createdAt', 'amount', 'status'])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
