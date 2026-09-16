import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  NOTIFICATION_LIMITS, NOTIFICATION_SORT_FIELDS, NOTIFICATION_TYPES, OPEN_CHANNELS,
  TOGGLEABLE_NOTIFICATION_TYPES,
} from '../notifications.constants';

/** Shared inbox query (customer + admin). Bounded, validated, whitelist-only. */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ default: NOTIFICATION_LIMITS.defaultPage, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = NOTIFICATION_LIMITS.defaultPage;

  @ApiPropertyOptional({
    default: NOTIFICATION_LIMITS.defaultLimit, minimum: 1, maximum: NOTIFICATION_LIMITS.maxLimit,
  })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(NOTIFICATION_LIMITS.maxLimit)
  limit: number = NOTIFICATION_LIMITS.defaultLimit;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsOptional() @IsIn(NOTIFICATION_TYPES)
  type?: string;

  @ApiPropertyOptional({ enum: OPEN_CHANNELS, default: 'IN_APP' })
  @IsOptional() @IsIn(OPEN_CHANNELS)
  channel?: string;

  @ApiPropertyOptional({ description: 'true = المقروءة فقط · false = غير المقروءة فقط' })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  read?: boolean;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z', description: 'من (شامل) — ISO 8601' })
  @IsOptional() @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T00:00:00.000Z', description: 'إلى (غير شامل) — ISO 8601' })
  @IsOptional() @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_SORT_FIELDS, default: 'createdAt' })
  @IsOptional() @IsIn(NOTIFICATION_SORT_FIELDS as unknown as string[])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Admin inbox adds an optional recipient filter — never a customer-facing option. */
export class AdminListNotificationsQueryDto extends ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'تصفية حسب معرّف المستلم (إدارة فقط)' })
  @IsOptional() @IsString() @MaxLength(40)
  userId?: string;
}

export class ListPreferencesQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsOptional() @IsIn(NOTIFICATION_TYPES)
  type?: string;
}

export class UpdatePreferenceDto {
  @ApiProperty({
    enum: TOGGLEABLE_NOTIFICATION_TYPES,
    description: 'الأنواع القابلة للتعطيل فقط — الإشعارات المعاملاتية إلزامية بسياسة المشروع',
  })
  @IsIn(TOGGLEABLE_NOTIFICATION_TYPES)
  type!: string;

  @ApiProperty({ description: 'تفعيل/تعطيل الإشعار داخل التطبيق' })
  @IsBoolean()
  inAppEnabled!: boolean;
}

export class ProcessOutboxDto {
  @ApiPropertyOptional({ default: NOTIFICATION_LIMITS.outboxBatch, minimum: 1, maximum: NOTIFICATION_LIMITS.outboxBatch })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(NOTIFICATION_LIMITS.outboxBatch)
  limit?: number;
}
