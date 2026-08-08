import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@mensah-rentals/database';

import { ReportingService } from './reporting.service';

describe('reporting correctness boundaries', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports the remaining reservation commitment without subtracting consumed twice', async () => {
    vi.spyOn(prisma.inventoryTransaction, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.inventoryTransaction, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.inventoryTransaction, 'groupBy').mockResolvedValue(
      [] as never,
    );
    vi.spyOn(prisma.inventoryItem, 'groupBy').mockResolvedValue([] as never);
    vi.spyOn(prisma.inventoryReservationItem, 'aggregate').mockResolvedValue({
      _sum: { reservedQuantity: 5 },
    } as never);

    const report = await new ReportingService().inventory({
      page: 1,
      pageSize: 25,
      preset: 'LAST_30_DAYS',
      sortDirection: 'desc',
    });
    expect(
      report.metrics.find(
        ({ key }) => key === 'reservation_commitment_quantity',
      )?.value,
    ).toBe(5);
  });

  it('keeps authoritative money values as exact cents for the DTO layer', () => {
    const metric = (
      new ReportingService() as unknown as {
        moneyMetric(
          key: string,
          label: string,
          value: bigint,
        ): {
          format: string;
          value: string;
        };
      }
    ).moneyMetric('quoted', 'Quoted value', 123_450n);
    expect(metric).toMatchObject({ format: 'MONEY', value: '123450' });
  });

  it('counts preparation from readyAt and partial checkout from immutable operation evidence', async () => {
    const startUtc = new Date('2026-08-01T00:00:00.000Z');
    const endExclusiveUtc = new Date('2026-09-01T00:00:00.000Z');
    const count = vi
      .spyOn(prisma.orderFulfilment, 'count')
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    const raw = vi
      .spyOn(prisma, '$queryRaw')
      .mockResolvedValue([{ value: 3n }]);

    const metrics = await (
      new ReportingService() as unknown as {
        fulfilmentMetrics(range: {
          startUtc: Date;
          endExclusiveUtc: Date;
        }): Promise<Array<{ key: string; value: number | string }>>;
      }
    ).fulfilmentMetrics({ startUtc, endExclusiveUtc });

    expect(count).toHaveBeenNthCalledWith(1, {
      where: { readyAt: { gte: startUtc, lt: endExclusiveUtc } },
    });
    expect(raw.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([expect.stringContaining('FulfilmentHandoff')]),
    );
    expect(metrics.find(({ key }) => key === 'orders_prepared')?.value).toBe(4);
    expect(
      metrics.find(({ key }) => key === 'orders_partially_checked_out')?.value,
    ).toBe(3);
  });

  it('defines scheduled inspections by immutable creation time, not current status', async () => {
    const startUtc = new Date('2026-08-01T00:00:00.000Z');
    const endExclusiveUtc = new Date('2026-09-01T00:00:00.000Z');
    vi.spyOn(prisma.maintenanceWorkOrder, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.maintenanceWorkOrder, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.maintenanceWorkOrder, 'groupBy').mockResolvedValue(
      [] as never,
    );
    vi.spyOn(prisma.equipmentInspection, 'groupBy').mockResolvedValue(
      [] as never,
    );
    const scheduled = vi
      .spyOn(prisma.equipmentInspection, 'count')
      .mockResolvedValue(7);

    const metrics = await (
      new ReportingService() as unknown as {
        maintenanceMetrics(range: {
          startUtc: Date;
          endExclusiveUtc: Date;
        }): Promise<Array<{ key: string; value: number | string }>>;
      }
    ).maintenanceMetrics({ startUtc, endExclusiveUtc });

    expect(scheduled).toHaveBeenCalledWith({
      where: { createdAt: { gte: startUtc, lt: endExclusiveUtc } },
    });
    expect(
      metrics.find(({ key }) => key === 'inspections_scheduled')?.value,
    ).toBe(7);
  });
});
