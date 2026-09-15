import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators';

const PHONE_REGEX = /^[0-9+\s-]{7,20}$/;

export class RegisterDto {
  @ApiProperty({ example: 'ahmad' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'hassan' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email?: string;

  @ApiProperty({ example: '0999111222' })
  @IsString()
  @Matches(PHONE_REGEX, { message: 'رقم الهاتف غير صالح' })
  phone!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  confirmPassword!: string;
}
