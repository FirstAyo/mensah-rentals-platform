import { describe, expect, it } from 'vitest';

import {
  createRentalOrderSchema,
  orderCustomerAccessSchema,
  rentalOrderListQuerySchema,
} from './order';

describe('rental order validation', () => {
  it('accepts only a strict UUID operation payload', () => {
    expect(
      createRentalOrderSchema.safeParse({
        operationId: '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00',
      }).success,
    ).toBe(true);
    expect(
      createRentalOrderSchema.safeParse({
        operationId: '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00',
        totalCents: 1,
      }).success,
    ).toBe(false);
    expect(
      createRentalOrderSchema.safeParse({ operationId: 'order-1' }).success,
    ).toBe(false);
  });

  it('validates the bounded list query and date range', () => {
    expect(rentalOrderListQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: 'confirmedAt',
      sortDirection: 'desc',
    });
    expect(rentalOrderListQuerySchema.safeParse({ page: 0 }).success).toBe(
      false,
    );
    expect(
      rentalOrderListQuerySchema.safeParse({ pageSize: 101 }).success,
    ).toBe(false);
    expect(
      rentalOrderListQuerySchema.safeParse({ status: 'CANCELLED' }).success,
    ).toBe(false);
    expect(
      rentalOrderListQuerySchema.safeParse({
        rentalStartFrom: '2027-02-02',
        rentalStartTo: '2027-02-01',
      }).success,
    ).toBe(false);
    expect(
      rentalOrderListQuerySchema.safeParse({ unknown: 'field' }).success,
    ).toBe(false);
  });

  it('accepts only the bounded order capability shape', () => {
    const valid = `${'8cbf58fb-b706-4bb2-aef1-205b1d1e4d00'}.${'a'.repeat(43)}`;
    expect(
      orderCustomerAccessSchema.safeParse({ capability: valid }).success,
    ).toBe(true);
    expect(
      orderCustomerAccessSchema.safeParse({ capability: 'not-a-token' })
        .success,
    ).toBe(false);
    expect(
      orderCustomerAccessSchema.safeParse({
        capability: valid,
        orderId: 'leak',
      }).success,
    ).toBe(false);
  });
});
