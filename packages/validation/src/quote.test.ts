import { describe, expect, it } from 'vitest';

import {
  calculateQuoteMoney,
  parseCadToCents,
  parsePercentToBasisPoints,
  quoteRevisionInputSchema,
} from './quote';

describe('quote money', () => {
  it('calculates cents, charges, taxable discount, and half-up tax exactly', () => {
    const totals = calculateQuoteMoney({
      items: [{ quantity: 3, unitPriceCents: 12550, taxable: true }],
      charges: [
        { amountCents: 5000, taxable: true },
        { amountCents: 1200, taxable: false },
      ],
      discountCents: 2500,
      discountTaxable: true,
      taxRateBasisPoints: 500,
    });
    expect(totals).toEqual({
      itemSubtotalCents: 37650n,
      chargeTotalCents: 6200n,
      subtotalCents: 43850n,
      taxableSubtotalCents: 40150n,
      taxCents: 2008n,
      totalCents: 43358n,
    });
  });

  it('rounds tax once at the quote level, half up', () => {
    expect(
      calculateQuoteMoney({
        items: [{ quantity: 1, unitPriceCents: 1, taxable: true }],
        charges: [],
        discountCents: 0,
        discountTaxable: true,
        taxRateBasisPoints: 5000,
      }).taxCents,
    ).toBe(1n);
  });

  it('rejects discounts beyond the applicable totals', () => {
    expect(() =>
      calculateQuoteMoney({
        items: [{ quantity: 1, unitPriceCents: 100, taxable: false }],
        charges: [],
        discountCents: 1,
        discountTaxable: true,
        taxRateBasisPoints: 0,
      }),
    ).toThrow('Taxable discount');
  });

  it('parses CAD decimal input without floating point arithmetic', () => {
    expect(parseCadToCents('125.50')).toBe(12550);
    expect(parseCadToCents('0.1')).toBe(10);
    expect(parseCadToCents('1.999')).toBeNull();
    expect(parsePercentToBasisPoints('5.25')).toBe(525);
    expect(parsePercentToBasisPoints('100.01')).toBeNull();
  });
});

describe('quote revision validation', () => {
  const base = {
    operationId: '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00',
    items: [
      {
        rentalRequestDecisionItemId: 'clx1234567890123456789012',
        quotedQuantity: 1,
        unitPriceCents: 100,
        taxable: true,
      },
    ],
    charges: [],
    discountCents: 0,
    discountTaxable: true,
    tax: { name: 'Tax', rateBasisPoints: 500 },
    validUntil: '2027-01-01T00:00:00.000Z',
  };

  it('rejects client-authored totals and duplicate decision items', () => {
    expect(
      quoteRevisionInputSchema.safeParse({ ...base, totalCents: 100 }).success,
    ).toBe(false);
    expect(
      quoteRevisionInputSchema.safeParse({
        ...base,
        items: [base.items[0], base.items[0]],
      }).success,
    ).toBe(false);
  });
});
