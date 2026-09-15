import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3], description: 'قائمة معرّفات الصلاحيات (استبدال كامل)' })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds!: number[];

  @ApiPropertyOptional({ default: false, description: 'مطلوب عند تعديل صلاحيات دور نظامي' })
  @IsOptional()
  @IsBoolean()
  confirmSystemRoleChange?: boolean;
}
