import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Ali' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: 'employee@example.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '0999111222' })
  @IsOptional() @IsString() @Matches(/^[0-9+\s-]{7,20}$/, { message: 'رقم الهاتف غير صالح' })
  phone?: string;
}
