import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from forgot-password flow' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;

  @ApiProperty()
  @IsString()
  confirmPassword!: string;
}
