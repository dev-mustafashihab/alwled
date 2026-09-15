import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token issued by login/register' })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class LogoutDto extends RefreshDto {}
