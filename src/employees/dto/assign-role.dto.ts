import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AssignRoleDto {
  @ApiPropertyOptional({ example: 2, description: 'معرّف الدور' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  roleId?: number;

  @ApiPropertyOptional({ example: 'SALES', description: 'اسم الدور بدلاً من المعرّف' })
  @IsOptional() @IsString()
  roleName?: string;
}
