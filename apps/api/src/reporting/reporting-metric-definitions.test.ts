import { describe, expect, it } from 'vitest';

import {
  projectInstantToBusinessDate,
  REPORTING_METRIC_DEFINITIONS,
} from './reporting-metric-definitions';

describe('authoritative report metric definitions', () => {
  it('uses READY time rather than preparation-start time for prepared orders', () => {
    expect(REPORTING_METRIC_DEFINITIONS.ordersPrepared.basis).toBe(
      'OrderFulfilment.readyAt',
    );
  });

  it('defines partial checkout and return from immutable operation deltas', () => {
    expect(REPORTING_METRIC_DEFINITIONS.partialCheckouts.kind).toBe(
      'IMMUTABLE_PERIOD_EVENT',
    );
    expect(REPORTING_METRIC_DEFINITIONS.partialCheckouts.basis).toContain(
      'FulfilmentOperation',
    );
    expect(REPORTING_METRIC_DEFINITIONS.partialReturns.basis).toContain(
      'RentalReturnOperation',
    );
  });

  it('counts scheduled inspections independently from their current status', () => {
    expect(REPORTING_METRIC_DEFINITIONS.inspectionsScheduled.basis).toBe(
      'EquipmentInspection.createdAt',
    );
    expect(
      REPORTING_METRIC_DEFINITIONS.inspectionsScheduled.description,
    ).toContain('regardless of their later lifecycle state');
  });

  it('projects a timestamptz instant directly into the business timezone date', () => {
    const instant = new Date('2026-08-08T01:30:00.000Z');
    expect(projectInstantToBusinessDate(instant, 'Africa/Accra')).toBe(
      '2026-08-08',
    );
    expect(projectInstantToBusinessDate(instant, 'America/Toronto')).toBe(
      '2026-08-07',
    );
  });
});
