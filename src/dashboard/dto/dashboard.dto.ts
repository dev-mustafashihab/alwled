import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DASHBOARD_LIMITS, DASHBOARD_SORT_FIELDS, TIMESERIES_GRANULARITIES,
} from '../dashboard.constants';

/**
 * Shared date range. Both bounds optional; validation is strict (ISO 8601 only)
 * and the actual semantics live in one place (dashboard.constants.resolveRange).
 */
export class DashboardDateRangeDto {
  @ApiPropertyOptional({
    example: '2026-08-17T00:00:00.000Z',
    description: 'بداية المدى (شاملة) — ISO 8601. إن لم تُرسل: آخر 30 يوماً.',
  })
  @IsOptional() @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-16T00:00:00.000Z',
    description: 'نهاية المدى (غير شاملة) — ISO 8601. إن لم تُرسل: حتى اللحظة (UTC).',
  })
  @IsOptional() @IsISO8601()
  to?: string;
}

/** Same pagination convention as the rest of the project, with a bounded limit. */
export class DashboardPaginationDto {
  @ApiPropertyOptional({ default: DASHBOARD_LIMITS.defaultPage, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = DASHBOARD_LIMITS.defaultPage;

  @ApiPropertyOptional({
    default: DASHBOARD_LIMITS.defaultLimit, minimum: 1, maximum: DASHBOARD_LIMITS.maxLimit,
  })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(DASHBOARD_LIMITS.maxLimit)
  limit: number = DASHBOARD_LIMITS.defaultLimit;
}

export class OrdersAnalyticsQueryDto extends DashboardDateRangeDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] })
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ description: 'تصفية حسب العملة (مثال USD)' })
  @IsOptional() @IsString()
  currency?: string;
}

export class PaymentsAnalyticsQueryDto extends DashboardDateRangeDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  @IsOptional() @IsIn(['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['SHAM_CASH'] })
  @IsOptional() @IsIn(['SHAM_CASH'])
  method?: string;

  @ApiPropertyOptional({ description: 'تصفية حسب العملة (مثال USD)' })
  @IsOptional() @IsString()
  currency?: string;
}

export class InventoryAnalyticsQueryDto {
  @ApiPropertyOptional({
    default: false,
    description: 'تضمين ملخص حركات المخزون (مجموعة حسب النوع)',
  })
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  includeMovements?: boolean;
}

export class VerificationsAnalyticsQueryDto extends DashboardDateRangeDto {}

export class RecentOrdersQueryDto extends DashboardPaginationDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] })
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ enum: DASHBOARD_SORT_FIELDS.recentOrders, default: 'createdAt' })
  @IsOptional() @IsIn(DASHBOARD_SORT_FIELDS.recentOrders as unknown as string[])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class RecentPaymentsQueryDto extends DashboardPaginationDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  @IsOptional() @IsIn(['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ enum: DASHBOARD_SORT_FIELDS.recentPayments, default: 'createdAt' })
  @IsOptional() @IsIn(DASHBOARD_SORT_FIELDS.recentPayments as unknown as string[])
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Sham Cash manual review queue — PENDING_REVIEW only, always. */
export class PaymentReviewQueryDto extends DashboardPaginationDto {
  @ApiPropertyOptional({ enum: DASHBOARD_SORT_FIELDS.paymentReview, default: 'submittedAt' })
  @IsOptional() @IsIn(DASHBOARD_SORT_FIELDS.paymentReview as unknown as string[])
  sortBy: string = 'submittedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}

export class TimeseriesQueryDto extends DashboardDateRangeDto {
  @ApiPropertyOptional({
    enum: TIMESERIES_GRANULARITIES, default: 'day',
    description: 'تجميع زمني (UTC): day | week | month',
  })
  @IsOptional() @IsIn(TIMESERIES_GRANULARITIES as unknown as string[])
  granularity: string = 'day';
}
