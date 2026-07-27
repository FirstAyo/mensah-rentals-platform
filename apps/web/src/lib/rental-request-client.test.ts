import { describe, expect, it } from 'vitest';

import { assertRentalRequestResponse } from './rental-request-client';

const safe = {
  decision: null,
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

  it('accepts customer-safe partial approval details', () => {
    expect(() =>
      assertRentalRequestResponse({
        ...safe,
        decision: {
          customerExplanation: 'We can support part of your request.',
          decidedAt: '2026-07-25T12:00:00.000Z',
          notice:
            'Approved quantities may be used to prepare a future custom quote. This decision is not a reservation, quote, or final order.',
          outcome: 'PARTIALLY_APPROVED',
        },
        items: safe.items.map((item) => ({ ...item, approvedQuantity: 80 })),
        status: {
          key: 'PARTIALLY_APPROVED',
          label: 'Request partially approved',
        },
      }),
    ).not.toThrow();
  });

  it('rejects staff-only decision details', () => {
    expect(() =>
      assertRentalRequestResponse({
        ...safe,
        decision: {
          customerExplanation: 'We can support this request.',
          decidedAt: '2026-07-25T12:00:00.000Z',
          decidedBy: { id: 'private' },
          internalReason: 'Private operations context',
          notice: 'This is not a quote.',
          outcome: 'APPROVED',
        },
        items: safe.items.map((item) => ({ ...item, approvedQuantity: 100 })),
        status: { key: 'APPROVED', label: 'Request approved' },
      }),
    ).toThrow(/Unsafe/);
  });

  it('rejects malformed decision scalars and non-authoritative notices', () => {
    const approved = {
      ...safe,
      decision: {
        customerExplanation: 'Please contact us before 5 PM.',
        decidedAt: '2026-07-25T12:00:00.000Z',
        notice:
          'Approved quantities may be used to prepare a future custom quote. This decision is not a reservation, quote, or final order.',
        outcome: 'APPROVED',
      },
      items: safe.items.map((item) => ({ ...item, approvedQuantity: 100 })),
      status: { key: 'APPROVED', label: 'Request approved' },
    };
    expect(() => assertRentalRequestResponse(approved)).not.toThrow();
    expect(() =>
      assertRentalRequestResponse({
        ...approved,
        decision: { ...approved.decision, decidedAt: 'not-a-date' },
      }),
    ).toThrow(/timestamp/i);
    expect(() =>
      assertRentalRequestResponse({
        ...approved,
        decision: { ...approved.decision, notice: 'Trust this response.' },
      }),
    ).toThrow(/notice/i);
  });

  it('accepts safe rejection tracking only when approved quantities are absent', () => {
    const rejected = {
      ...safe,
      decision: {
        customerExplanation: 'We are unable to support this request.',
        decidedAt: '2026-07-25T12:00:00.000Z',
        notice: 'This decision is not a quote or final order.',
        outcome: 'REJECTED',
      },
      status: { key: 'REJECTED', label: 'Request not approved' },
    };
    expect(() => assertRentalRequestResponse(rejected)).not.toThrow();
    expect(() =>
      assertRentalRequestResponse({
        ...rejected,
        items: safe.items.map((item) => ({ ...item, approvedQuantity: 0 })),
      }),
    ).toThrow(/approved quantity/i);
  });
});
