import { describe, expect, it } from 'vitest';

import { resolveReportRange } from './report-date-range';

describe('report date range', () => {
  it('uses inclusive business dates and an exclusive UTC end boundary', () => {
    const result = resolveReportRange(
      { endDate: '2026-03-08', preset: 'CUSTOM', startDate: '2026-03-08' },
      'America/Toronto',
      366,
    );
    expect(result.startUtc.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(result.endExclusiveUtc.toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('rejects excessive ranges', () => {
    expect(() =>
      resolveReportRange(
        { endDate: '2026-12-31', preset: 'CUSTOM', startDate: '2025-01-01' },
        'UTC',
        366,
      ),
    ).toThrow('Report ranges');
  });
});
