import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDefined, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class ProductSpecificationItemDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  specificationId!: number;

  @ApiProperty({ example: '500', description: 'تُخزَّن كقيمة مجرّدة — الوحدة في التعريف' })
  @IsDefined() @IsString() @MaxLength(500)
  value!: string;
}

/** Replaces the whole specification set of a product (transactional). */
export class SetProductSpecificationsDto {
  @ApiProperty({ type: [ProductSpecificationItemDto] })
  @IsArray() @ArrayMaxSize(120) @ValidateNested({ each: true }) @Type(() => ProductSpecificationItemDto)
  specifications!: ProductSpecificationItemDto[];
}
