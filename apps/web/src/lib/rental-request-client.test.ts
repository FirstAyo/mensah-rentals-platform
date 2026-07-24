import { describe, expect, it } from 'vitest';

import { assertRentalRequestResponse } from './rental-request-client';

const safe = {
  fulfillmentMethod: 'PICKUP',
  items: [
    {
      categoryName: 'Seating',
      categorySlug: 'seating',
      productName: 'Folding Chair',
      productSlug: 'folding-chair',
      rentalUnit: 'each',
      requestedQuantity: 100,
    },
  ],
  projectName: 'Community event',
  referenceNumber: 'MR-2026-ABCDEFGH23',
  rentalEndDate: '2026-08-03',
  rentalStartDate: '2026-08-01',
  status: { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
  submittedAt: '2026-07-24T12:00:00.000Z',
};

describe('public rental request response boundary', () => {
  it('accepts the exact customer-safe tracking response', () => {
    expect(() => assertRentalRequestResponse(safe)).not.toThrow();
  });

  it.each([
    { availableQuantity: 80 },
    { totalQuantity: 80 },
    { reservation: { id: 'private' } },
    { contactEmail: 'private@example.test' },
    { customerNotes: 'private' },
    { staffId: 'private' },
    { requestToken: 'secret' },
    { price: 100 },
  ])('rejects confidential and out-of-scope keys', (extra) => {
    expect(() => assertRentalRequestResponse({ ...safe, ...extra })).toThrow(
      /Unsafe/,
    );
  });
});
