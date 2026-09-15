import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Inventory is NEVER updated through the product endpoints. */
export class UpdateInventoryDto {
  @ApiPropertyOptional({ example: 10, description: 'حد التنبيه للمخزون المنخفض' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    example: 25,
    description: 'قيمة مطلقة للمخزون (تُسجَّل كحركة ADJUSTMENT) — للتعديل النسبي استخدم /adjust',
  })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  quantity?: number;
}
