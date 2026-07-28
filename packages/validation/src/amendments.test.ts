import { describe, expect, it } from 'vitest';

import {
  submitRentalChangeRequestSchema,
  submitRentalRequestAmendmentSchema,
} from './index';

const base = {
  companyName: null,
  contactEmail: 'customer@example.test',
  contactFirstName: 'Test',
  contactLastName: 'Customer',
  contactPhone: '+1 555 0100',
  customerNotes: null,
  deliveryAddress: null,
  expectedRevisionNumber: 1,
  fulfillmentMethod: 'PICKUP' as const,
  items: [{ productId: 'clz123456789012345678901', requestedQuantity: 2 }],
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  projectLocation: 'Studio A',
  projectName: 'Production',
  projectType: 'Film',
  rentalEndDate: '2026-09-11',
  rentalStartDate: '2026-09-10',
  requestedTimeZone: 'America/Toronto',
};

describe('rental request amendment validation', () => {
  it('accepts a bounded complete replacement list', () => {
    expect(
      submitRentalRequestAmendmentSchema.safeParse({
        ...base,
        amendmentReason: 'The project requirements changed.',
      }).success,
    ).toBe(true);
  });

  it.each([
    { items: [] },
    { items: [{ ...base.items[0], requestedQuantity: 0 }] },
    { items: [{ ...base.items[0], requestedQuantity: -1 }] },
    { items: [base.items[0], base.items[0]] },
  ])('rejects invalid replacement items %#', (change) => {
    expect(
      submitRentalRequestAmendmentSchema.safeParse({
        ...base,
        ...change,
        amendmentReason: 'The project requirements changed.',
      }).success,
    ).toBe(false);
  });

  it('requires a reason for a formal change request', () => {
    expect(
      submitRentalChangeRequestSchema.safeParse({ ...base, reason: '' })
        .success,
    ).toBe(false);
  });
});
