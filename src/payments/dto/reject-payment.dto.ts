import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Rejecting a declared transfer is a financial decision — a reason is mandatory. */
export class RejectPaymentDto {
  @ApiProperty({ example: 'رقم العملية غير مطابق للكشف', minLength: 3, maxLength: 300 })
  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}
