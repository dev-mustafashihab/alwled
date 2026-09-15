import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * `price` / `unitPrice` / `subtotal` are intentionally absent: the global
 * ValidationPipe runs with forbidNonWhitelisted, so sending them returns 400.
 */
export class AddCartItemDto {
  @ApiProperty({ example: 1, description: 'معرّف المنتج' })
  @Type(() => Number) @IsInt() @Min(1)
  productId!: number;

  @ApiProperty({ example: 2, minimum: 1, description: 'الكمية المطلوبة (عدد صحيح)' })
  @Type(() => Number) @IsInt() @Min(1)
  quantity!: number;
}
