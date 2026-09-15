import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ example: false, description: 'false = تعطيل الحساب وإلغاء جلساته' })
  @IsBoolean()
  isActive!: boolean;
}
