import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelPaymentDto {
  @ApiPropertyOptional({ example: 'إلغاء بطلب العميل', maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
