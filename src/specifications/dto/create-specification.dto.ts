import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';
import { SpecificationType } from '@prisma/client';

export class CreateSpecificationDefinitionDto {
  @ApiProperty({ example: 'السعة' })
  @IsString() @MinLength(2) @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'capacity', description: 'يُولَّد من الاسم إذا لم يُرسل' })
  @IsOptional() @IsString() @MaxLength(80)
  key?: string;

  @ApiProperty({ enum: SpecificationType, example: 'NUMBER' })
  @IsIn(['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'])
  type!: SpecificationType;

  @ApiPropertyOptional({ example: 'L', description: 'الوحدة تُخزَّن منفصلة عن القيمة' })
  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ type: [String], example: ['A+', 'A', 'B'] })
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'تقييد المواصفة بتصنيف معيّن' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
