import { describe, expect, it } from 'vitest';

import {
  inventoryReportQuerySchema,
  maintenanceReportQuerySchema,
  rentalsReturnsReportQuerySchema,
} from './reporting.schemas';

describe('report filter validation', () => {
  it('parses combined server-side filters without losing pagination', () => {
    expect(
      inventoryReportQuerySchema.parse({
        action: 'CHECKOUT',
        categoryId: 'cm00000000000000000000001',
        page: '3',
        pageSize: '50',
        preset: 'LAST_30_DAYS',
        productId: 'cm00000000000000000000002',
        search: 'chair',
        sortDirection: 'asc',
        trackingMode: 'SERIALIZED',
      }),
    ).toMatchObject({
      action: 'CHECKOUT',
      page: 3,
      pageSize: 50,
      search: 'chair',
      sortDirection: 'asc',
      trackingMode: 'SERIALIZED',
    });
  });

  it('rejects unbounded or unknown report query input', () => {
    expect(
      maintenanceReportQuerySchema.safeParse({
        page: 101,
        pageSize: 101,
        preset: 'LAST_30_DAYS',
        secret: 'not-allowed',
      }).success,
    ).toBe(false);
  });

  it('normalizes the overdue boolean and requires valid custom dates', () => {
    expect(
      rentalsReturnsReportQuerySchema.parse({
        overdue: 'true',
        preset: 'LAST_7_DAYS',
      }).overdue,
    ).toBe(true);
    expect(
      rentalsReturnsReportQuerySchema.safeParse({
        endDate: '2026-08-01',
        preset: 'CUSTOM',
      }).success,
    ).toBe(false);
  });
});
