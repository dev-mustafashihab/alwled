import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

const dec = (v: string) => new Prisma.Decimal(v);

describe('AnalyticsService (time series)', () => {
  let prisma: any;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new AnalyticsService(prisma);
  });

  it('fills every bucket in the range, zeros included', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { bucket: new Date('2026-09-02T00:00:00.000Z'), n: BigInt(2), amount: dec('100.20') },
      ])
      .mockResolvedValueOnce([
        { bucket: new Date('2026-09-02T00:00:00.000Z'), n: BigInt(1), amount: dec('0.01') },
      ]);

    const result = await service.timeseries({
      from: '2026-09-01T00:00:00.000Z', to: '2026-09-04T00:00:00.000Z', granularity: 'day',
    } as never);

    expect(result.series.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(result.series[0]).toEqual({
      date: '2026-09-01', orders: 0, orderValue: '0.00',
      succeededPayments: 0, succeededPaymentAmount: '0.00',
    });
    expect(result.series[1]).toEqual({
      date: '2026-09-02', orders: 2, orderValue: '100.20',
      succeededPayments: 1, succeededPaymentAmount: '0.01',
    });
    expect(result.totals).toEqual({
      orders: 2, orderValue: '100.20', succeededPayments: 1, succeededPaymentAmount: '0.01',
    });
    expect(result.range.boundary).toBe('from inclusive / to exclusive');
    expect(result.granularity).toBe('day');
  });

  it('never mixes order value with payment value and sums in decimal space', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { bucket: new Date('2026-09-01T00:00:00.000Z'), n: BigInt(1), amount: dec('0.01') },
        { bucket: new Date('2026-09-02T00:00:00.000Z'), n: BigInt(1), amount: dec('0.02') },
        { bucket: new Date('2026-09-03T00:00:00.000Z'), n: BigInt(1), amount: dec('999999.99') },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.timeseries({
      from: '2026-09-01T00:00:00.000Z', to: '2026-09-04T00:00:00.000Z', granularity: 'day',
    } as never);
    // 0.01 + 0.02 + 999999.99 = 1000000.02 exactly — no float artifacts
    expect(result.totals.orderValue).toBe('1000000.02');
    expect(result.totals.succeededPaymentAmount).toBe('0.00');
    expect(JSON.stringify(result)).not.toMatch(/\d\.\d{6,}/);
  });

  it('groups weekly buckets from Monday (UTC) like date_trunc', async () => {
    prisma.$queryRaw.mockResolvedValue([{ bucket: new Date('2026-09-07T00:00:00.000Z'), n: BigInt(1), amount: dec('5.00') }]);
    const result = await service.timeseries({
      from: '2026-09-07T00:00:00.000Z', to: '2026-09-21T00:00:00.000Z', granularity: 'week',
    } as never);
    expect(result.series.map((p) => p.date)).toEqual(['2026-09-07', '2026-09-14']);
    expect(result.series[0]).toMatchObject({ orders: 1, orderValue: '5.00' });
  });

  it('groups monthly buckets on the first of the month (UTC)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const result = await service.timeseries({
      from: '2026-08-15T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', granularity: 'month',
    } as never);
    expect(result.series.map((p) => p.date)).toEqual(['2026-08-01', '2026-09-01']);
  });

  it('parameterizes SQL: values are bound, never interpolated into the text', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.timeseries({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', granularity: 'day' } as never);
    const [ordersCall, paymentsCall] = prisma.$queryRaw.mock.calls;
    const ordersText = (ordersCall[0] as string[]).join('?');
    const paymentsText = (paymentsCall[0] as string[]).join('?');
    expect(ordersText).toContain('FROM orders');
    expect(paymentsText).toContain('FROM payments');
    expect(ordersText).toContain('date_trunc(');
    // status is a bound parameter of the second query, never a string literal
    expect(paymentsCall.slice(1)).toContain('SUCCEEDED');
    expect(paymentsText).not.toContain('SUCCEEDED');
    expect(ordersCall.slice(1).some((v: unknown) => v instanceof Date)).toBe(true);
  });

  it('rejects invalid ranges with 400', async () => {
    await expect(service.timeseries({ from: '2026-09-05T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' } as never))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.timeseries({ from: 'yesterday' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
