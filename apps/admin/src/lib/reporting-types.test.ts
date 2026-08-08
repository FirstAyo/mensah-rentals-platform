import { describe, expect, it } from 'vitest';
import { parseReportResponse, REPORT_DEFINITIONS } from './reporting-types';
import { parseAuditEntry } from './audit-types';
import { parseSystemStatus } from './system-status-types';
import { metricValue } from '@/components/report-view';

describe('Phase 18 strict admin DTOs', () => {
  it('formats exact money cents as currency rather than raw cents', () => {
    expect(
      metricValue({
        key: 'quote_value',
        label: 'Quoted value',
        value: '123450',
        format: 'MONEY',
        currency: 'CAD',
      }),
    ).toMatch(/1,234\.50/);
  });
  it('accepts an exact report and rejects unexpected sensitive fields', () => {
    const value = {
      range: {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        timeZone: 'Africa/Accra',
      },
      metrics: [
        { key: 'requests', label: 'Requests', value: 3, format: 'COUNT' },
      ],
      series: [],
      items: [],
      meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    };
    expect(parseReportResponse(value)).not.toBeNull();
    expect(parseReportResponse({ ...value, databaseUrl: 'secret' })).toBeNull();
    expect(
      REPORT_DEFINITIONS['quotes-orders'].description.toLowerCase(),
    ).toContain('without treating values as collected revenue');
  });

  it('rejects audit credentials and unknown system fields', () => {
    const audit = {
      id: 'source:id',
      source: 'RENTAL_REQUEST_ACTIVITY',
      occurredAt: '2026-08-08T00:00:00.000Z',
      actor: null,
      domain: 'RENTAL_REQUEST',
      action: 'SUBMITTED',
      entity: { type: 'RentalRequest', reference: 'MR-1' },
      summary: 'Request submitted.',
    };
    expect(parseAuditEntry(audit)).not.toBeNull();
    expect(parseAuditEntry({ ...audit, passwordHash: 'secret' })).toBeNull();
    const system = {
      generatedAt: '2026-08-08T00:00:00.000Z',
      environment: 'development',
      api: {
        status: 'ok',
        uptimeSeconds: 10,
        version: null,
        commit: null,
      },
      database: {
        status: 'ok',
        migrations: {
          applied: 48,
          expected: 48,
          failed: 0,
          upToDate: true,
        },
      },
      media: { status: 'writable' },
      integrations: { googleReviews: { configured: true } },
    };
    expect(parseSystemStatus(system)).not.toBeNull();
    expect(parseSystemStatus({ ...system, databaseUrl: 'secret' })).toBeNull();
  });
});
