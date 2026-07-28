import { describe, expect, it } from 'vitest';

import {
  completeInventoryReservationSchema,
  createInventoryReservationSchema,
  createRentalOrderSchema,
  orderCustomerAccessSchema,
  releaseInventoryReservationSchema,
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

  it('requires an override reason exactly for intentional partial reservation', () => {
    const operationId = '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00';
    expect(
      createInventoryReservationSchema.safeParse({
        allowPartial: true,
        operationId,
      }).success,
    ).toBe(false);
    expect(
      createInventoryReservationSchema.safeParse({
        allowPartial: true,
        operationId,
        overrideReason:
          'Supplier shortfall will be resolved before fulfilment.',
      }).success,
    ).toBe(true);
    expect(
      completeInventoryReservationSchema.safeParse({
        allowPartial: false,
        expectedVersion: 1,
        operationId,
        overrideReason: 'Not allowed for a full attempt.',
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate serialized assets across order items', () => {
    const assetId = 'cm1abcdefghijklmnopqrst';
    const parsed = createInventoryReservationSchema.safeParse({
      allowPartial: false,
      operationId: '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00',
      serializedSelections: [
        {
          rentalOrderItemId: 'cm1abcdefghijklmnopqrstu',
          serializedAssetIds: [assetId],
        },
        {
          rentalOrderItemId: 'cm1abcdefghijklmnopqrstv',
          serializedAssetIds: [assetId],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('requires unique release items and exactly one release mechanism', () => {
    const operationId = '8cbf58fb-b706-4bb2-aef1-205b1d1e4d00';
    const itemId = 'cm1abcdefghijklmnopqrstu';
    const allocationId = 'cm1abcdefghijklmnopqrst';
    const base = {
      expectedVersion: 1,
      operationId,
      reason: 'Release validation fixture.',
    };
    expect(
      releaseInventoryReservationSchema.safeParse({
        ...base,
        items: [
          {
            allocationIds: [allocationId],
            quantity: 1,
            rentalOrderItemId: itemId,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      releaseInventoryReservationSchema.safeParse({
        ...base,
        items: [
          { allocationIds: [], quantity: 1, rentalOrderItemId: itemId },
          { allocationIds: [], quantity: 1, rentalOrderItemId: itemId },
        ],
      }).success,
    ).toBe(false);
  });
});
