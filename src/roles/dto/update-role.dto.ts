import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'مبيعات المتجر' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description?: string;
}
