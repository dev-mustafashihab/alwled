import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAuditQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ example: 'ROLE_ASSIGNED' })
  @IsOptional() @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'معرّف المستخدم المنفّذ' })
  @IsOptional() @IsString()
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'معرّف الكيان المستهدف (مستخدم أو دور)' })
  @IsOptional() @IsString()
  targetUserId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional() @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59.000Z' })
  @IsOptional() @IsISO8601()
  to?: string;
}
