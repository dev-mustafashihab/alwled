import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, Min,
} from 'class-validator';
import { IsStrongPassword } from '../../common/validators';

const PHONE_REGEX = /^[0-9+\s-]{7,20}$/;

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString() @MinLength(2) @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Ali' })
  @IsString() @MinLength(2) @MaxLength(60)
  lastName!: string;

  @ApiPropertyOptional({ example: 'employee@example.com' })
  @IsOptional() @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email?: string;

  @ApiProperty({ example: '0999111222' })
  @IsString() @Matches(PHONE_REGEX, { message: 'رقم الهاتف غير صالح' })
  phone!: string;

  @ApiProperty({ example: 'Str0ng!Pass1', description: 'كلمة مرور أولية (تُشفّر بـArgon2)' })
  @IsString() @MinLength(8) @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({ example: 3, description: 'معرّف الدور — افتراضياً EMPLOYEE' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  roleId?: number;

  @ApiPropertyOptional({ example: 'EMPLOYEE', description: 'بديل عن roleId' })
  @IsOptional() @IsString()
  roleName?: string;
}
