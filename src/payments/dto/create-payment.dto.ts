import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { SUPPORTED_PAYMENT_METHODS } from '../payments.constants';

/**
 * The ONLY accepted field is the order id: amount, currency, userId, status and
 * provider identifiers are server-controlled. Unknown fields are rejected by the
 * global ValidationPipe (whitelist + forbidNonWhitelisted).
 */
export class CreatePaymentDto {
  @ApiPropertyOptional({ example: 12, description: 'معرّف الطلب (من GET /orders)' })
  @Type(() => Number) @IsInt() @Min(1)
  orderId!: number;

  @ApiPropertyOptional({
    enum: SUPPORTED_PAYMENT_METHODS,
    default: 'SHAM_CASH',
    description: 'الطريقة المدعومة حالياً: SHAM_CASH (بلا أي تكامل مزوّد بعد)',
  })
  @IsOptional() @IsIn(SUPPORTED_PAYMENT_METHODS as unknown as string[])
  method?: (typeof SUPPORTED_PAYMENT_METHODS)[number];
}
