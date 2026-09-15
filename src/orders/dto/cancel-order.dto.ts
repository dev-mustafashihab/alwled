import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'تغيير في الرأي', maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
