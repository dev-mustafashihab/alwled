import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ example: 3, minimum: 1, description: 'الكمية الجديدة (استبدال كامل)' })
  @Type(() => Number) @IsInt() @Min(1)
  quantity!: number;
}
