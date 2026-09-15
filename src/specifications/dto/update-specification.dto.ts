import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength,
} from 'class-validator';
import { SpecificationType } from '@prisma/client';

export class UpdateSpecificationDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: SpecificationType })
  @IsOptional() @IsIn(['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'])
  type?: SpecificationType;

  @ApiPropertyOptional({ description: 'null لإزالة الوحدة' })
  @IsOptional() @IsString() @MaxLength(20)
  unit?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;
}
