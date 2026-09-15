import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustInventoryDto {
  @ApiProperty({ example: 10, description: 'فرق مُوقَّع: موجب = إدخال، سالب = إخراج (لا يقبل الصفر)' })
  @Type(() => Number) @IsInt()
  quantity!: number;

  @ApiProperty({ example: 'STOCK_RECEIVED' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  reason!: string;

  @ApiPropertyOptional({
    enum: ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'],
    description: 'افتراضياً يُستنتج من إشارة الكمية',
  })
  @IsOptional() @IsIn(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'])
  type?: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
}
