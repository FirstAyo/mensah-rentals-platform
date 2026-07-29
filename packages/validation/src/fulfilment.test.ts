import { describe, expect, it } from 'vitest';
import {
  checkoutFulfilmentSchema,
  updatePreparationSchema,
} from './fulfilment';

const operationId = '00000000-0000-4000-8000-000000000000';
const itemId = 'cm00000000000000000000000';

describe('fulfilment validation', () => {
  it('rejects duplicate lines and negative preparation quantities', () => {
    expect(
      updatePreparationSchema.safeParse({
        operationId,
        expectedVersion: 1,
        items: [
          {
            rentalOrderItemId: itemId,
            quantity: -1,
            serializedAllocationIds: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      updatePreparationSchema.safeParse({
        operationId,
        expectedVersion: 1,
        items: [
          {
            rentalOrderItemId: itemId,
            quantity: 1,
            serializedAllocationIds: [],
          },
          {
            rentalOrderItemId: itemId,
            quantity: 1,
            serializedAllocationIds: [],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('requires a reason only for intentional partial checkout', () => {
    const common = {
      operationId,
      expectedVersion: 2,
      expectedReservationVersion: 3,
      handoffAt: '2026-07-30T12:00:00.000Z',
      items: [
        { rentalOrderItemId: itemId, quantity: 1, serializedAllocationIds: [] },
      ],
      recipientName: 'Customer',
    };
    expect(
      checkoutFulfilmentSchema.safeParse({ ...common, allowPartial: true })
        .success,
    ).toBe(false);
    expect(
      checkoutFulfilmentSchema.safeParse({
        ...common,
        allowPartial: true,
        internalReason: 'Only prepared stock leaves today.',
      }).success,
    ).toBe(true);
    expect(
      checkoutFulfilmentSchema.safeParse({
        ...common,
        allowPartial: false,
        internalReason: 'Not allowed',
      }).success,
    ).toBe(false);
  });
  it('rejects duplicate serialized allocation selections', () => {
    const allocation = 'cm00000000000000000000001';
    expect(
      updatePreparationSchema.safeParse({
        operationId,
        expectedVersion: 1,
        items: [
          {
            rentalOrderItemId: itemId,
            quantity: 2,
            serializedAllocationIds: [allocation, allocation],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
