import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'حسن' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '0999111222', description: 'تغيير الهاتف يعيد حالة التوثيق' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s-]{7,20}$/, { message: 'رقم الهاتف غير صالح' })
  phone?: string;
}
