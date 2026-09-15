import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'SALES', description: 'اسم الدور (أحرف كبيرة/أرقام/شرطة سفلية)' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'اسم الدور يجب أن يكون بأحرف كبيرة وأرقام فقط' })
  name!: string;

  @ApiPropertyOptional({ example: 'موظف مبيعات' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: [Number], description: 'صلاحيات أولية' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds?: number[];
}
