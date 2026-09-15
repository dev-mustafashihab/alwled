import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { VerificationChannel } from '@prisma/client';

export class VerifyAccountDto {
  @ApiProperty({ description: 'Verification token or OTP code' })
  @IsString()
  @MinLength(4)
  token!: string;
}

export class ResendVerificationDto {
  @ApiPropertyOptional({ enum: VerificationChannel, default: VerificationChannel.OTP })
  @IsOptional()
  @IsEnum(VerificationChannel)
  channel?: VerificationChannel;
}
