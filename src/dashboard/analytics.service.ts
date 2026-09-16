import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { toMoneyString } from '../common/utils/money.util';
import {
  DashboardRangeError, TimeseriesGranularity, resolveRange,
} from './dashboard.constants';
import { TimeseriesQueryDto } from './dto/dashboard.dto';

interface BucketRow {
  bucket: Date;
  n: bigint;
  amount: Prisma.Decimal | string | null;
}

/**
 * Time-series analytics (Stage 10) — read-only.
 *
 * Money is aggregated by PostgreSQL NUMERIC and returned as strings; nothing here
 * converts an amount to a JavaScript float. Buckets are computed with
 * date_trunc() over UTC timestamps and mirrored exactly when gaps are filled,
 * so day/week/month grouping is deterministic.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async orderBuckets(granularity: TimeseriesGranularity, from: Date, to: Date) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${granularity}, created_at) AS bucket,
             COUNT(*)::bigint                       AS n,
             COALESCE(SUM(total), 0)                AS amount
      FROM orders
      WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY bucket
      ORDER BY bucket ASC`;
  }

  private async succeededPaymentBuckets(granularity: TimeseriesGranularity, from: Date, to: Date) {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${granularity}, created_at) AS bucket,
             COUNT(*)::bigint                       AS n,
             COALESCE(SUM(amount), 0)               AS amount
      FROM payments
      WHERE created_at >= ${from} AND created_at < ${to}
        AND status::text = ${'SUCCEEDED'}
      GROUP BY bucket
      ORDER BY bucket ASC`;
  }

  /** UTC bucket key that matches PostgreSQL date_trunc() output. */
  private bucketKey(date: Date, granularity: TimeseriesGranularity): string {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (granularity === 'day') return utc.toISOString().slice(0, 10);
    if (granularity === 'month') return `${utc.toISOString().slice(0, 7)}-01`;
    const day = utc.getUTCDay(); // 0 = Sunday → ISO week starts Monday
    const offset = day === 0 ? 6 : day - 1;
    utc.setUTCDate(utc.getUTCDate() - offset);
    return utc.toISOString().slice(0, 10);
  }

  private nextBucket(date: Date, granularity: TimeseriesGranularity): Date {
    const next = new Date(date);
    if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
    else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  /**
   * Daily/weekly/monthly series. Order value and payment value are reported in
   * separate fields on purpose: they answer different questions.
   */
  async timeseries(query: TimeseriesQueryDto) {
    let range;
    try {
      range = resolveRange(query.from, query.to);
    } catch (error) {
      if (error instanceof DashboardRangeError) throw new BadRequestException(error.message);
      throw error;
    }
    const granularity = (query.granularity ?? 'day') as TimeseriesGranularity;

    const [orderRows, paymentRows] = await Promise.all([
      this.orderBuckets(granularity, range.from, range.to),
      this.succeededPaymentBuckets(granularity, range.from, range.to),
    ]);

    const ordersByKey = new Map(orderRows.map((row) => [this.bucketKey(new Date(row.bucket), granularity), row]));
    const paymentsByKey = new Map(paymentRows.map((row) => [this.bucketKey(new Date(row.bucket), granularity), row]));

    const series: Array<{
      date: string; orders: number; orderValue: string;
      succeededPayments: number; succeededPaymentAmount: string;
    }> = [];

    let cursor = new Date(range.from);
    cursor = new Date(this.bucketKey(cursor, granularity));
    while (cursor.getTime() < range.to.getTime()) {
      const key = this.bucketKey(cursor, granularity);
      const orderRow = ordersByKey.get(key);
      const paymentRow = paymentsByKey.get(key);
      series.push({
        date: key,
        orders: Number(orderRow?.n ?? 0),
        orderValue: toMoneyString(orderRow?.amount ?? new Prisma.Decimal(0)) as string,
        succeededPayments: Number(paymentRow?.n ?? 0),
        succeededPaymentAmount: toMoneyString(paymentRow?.amount ?? new Prisma.Decimal(0)) as string,
      });
      cursor = this.nextBucket(cursor, granularity);
    }

    const totals = series.reduce(
      (acc, point) => ({
        orders: acc.orders + point.orders,
        orderValue: acc.orderValue.plus(point.orderValue),
        succeededPayments: acc.succeededPayments + point.succeededPayments,
        succeededPaymentAmount: acc.succeededPaymentAmount.plus(point.succeededPaymentAmount),
      }),
      {
        orders: 0, orderValue: new Prisma.Decimal(0),
        succeededPayments: 0, succeededPaymentAmount: new Prisma.Decimal(0),
      },
    );

    return {
      range: {
        from: range.fromIso, to: range.toIso, timezone: range.timezone,
        days: range.days, boundary: 'from inclusive / to exclusive',
      },
      granularity,
      buckets: series.length,
      series,
      totals: {
        orders: totals.orders,
        orderValue: toMoneyString(totals.orderValue),
        succeededPayments: totals.succeededPayments,
        succeededPaymentAmount: toMoneyString(totals.succeededPaymentAmount),
      },
    };
  }
}
