import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * Admins/employees may only move an order forward (CONFIRMED) or cancel it.
 * PENDING can never be *set* — that is the creation default.
 * NOTE: every declared property needs a validation decorator, otherwise the
 * global whitelist considers it "not whitelisted" and rejects the request.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'], example: 'CONFIRMED' })
  @IsIn(['CONFIRMED', 'CANCELLED'])
  status!: OrderStatus;

  @ApiPropertyOptional({ description: 'سبب الإلغاء عند status=CANCELLED', maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
