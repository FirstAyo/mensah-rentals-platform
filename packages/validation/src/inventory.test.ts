import { describe, expect, it } from 'vitest';

import {
  bulkInventoryMovementSchema,
  createInventoryItemSchema,
  createInventorySchema,
} from './index';

describe('inventory validation', () => {
  it('requires a quantity only for bulk inventory', () => {
    const common = {
      productId: 'cm00000000000000000000000',
      operationId: '00000000-0000-4000-8000-000000000000',
      reason: 'Initial count',
    };
    expect(
      createInventorySchema.safeParse({ ...common, trackingMode: 'BULK' })
        .success,
    ).toBe(false);
    expect(
      createInventorySchema.safeParse({
        ...common,
        trackingMode: 'SERIALIZED',
        initialQuantity: 2,
      }).success,
    ).toBe(false);
  });

  it('rejects same-state and non-positive movements', () => {
    expect(
      bulkInventoryMovementSchema.safeParse({
        fromState: 'RENTABLE',
        toState: 'RENTABLE',
        quantity: 0,
        operationId: '00000000-0000-4000-8000-000000000000',
        reason: 'Invalid',
      }).success,
    ).toBe(false);
  });

  it('normalizes asset numbers and rejects unknown fields', () => {
    const parsed = createInventoryItemSchema.parse({
      assetNumber: ' asset-1 ',
      initialState: 'RENTABLE',
      operationId: '00000000-0000-4000-8000-000000000000',
      reason: 'Received',
    });
    expect(parsed.assetNumber).toBe('ASSET-1');
    expect(
      createInventoryItemSchema.safeParse({ ...parsed, actorId: 'forged' })
        .success,
    ).toBe(false);
  });
});
