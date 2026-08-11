import { describe, expect, it } from 'vitest';

import {
  addInventoryStockSchema,
  bulkInventoryMovementSchema,
  createInventoryItemSchema,
  createInventorySchema,
  reduceInventoryStockSchema,
  transitionInventoryItemSchema,
  updateInventoryMetadataSchema,
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
    expect(
      createInventoryItemSchema.safeParse({ ...parsed, initialState: 'LOST' })
        .success,
    ).toBe(false);
    expect(
      transitionInventoryItemSchema.safeParse({
        toState: 'RENTABLE',
        operationId: parsed.operationId,
        reason: 'Unsafe workflow shortcut',
      }).success,
    ).toBe(false);
  });

  it('blocks operational workflow states from generic inventory changes', () => {
    const common = {
      productId: 'cm00000000000000000000000',
      trackingMode: 'BULK',
      initialQuantity: 1,
      operationId: '00000000-0000-4000-8000-000000000000',
      reason: 'Unsafe workflow shortcut',
    };
    expect(
      createInventorySchema.safeParse({ ...common, initialState: 'RENTED' })
        .success,
    ).toBe(false);
    expect(
      bulkInventoryMovementSchema.safeParse({
        fromState: 'RENTED',
        toState: 'RENTABLE',
        quantity: 1,
        operationId: common.operationId,
        reason: common.reason,
      }).success,
    ).toBe(false);
    expect(
      bulkInventoryMovementSchema.safeParse({
        fromState: 'RENTABLE',
        toState: 'MAINTENANCE',
        quantity: 1,
        operationId: common.operationId,
        reason: common.reason,
      }).success,
    ).toBe(false);
  });

  it('requires positive bounded stock operations and typed reasons', () => {
    const common = {
      operationId: '00000000-0000-4000-8000-000000000000',
      reason: 'Purchased additional chairs',
      quantity: 10,
    };
    expect(
      addInventoryStockSchema.parse({ ...common, reasonType: 'PURCHASE' }),
    ).toMatchObject({ quantity: 10, reasonType: 'PURCHASE' });
    expect(
      addInventoryStockSchema.safeParse({
        ...common,
        quantity: 0,
        reasonType: 'PURCHASE',
      }).success,
    ).toBe(false);
    expect(
      addInventoryStockSchema.safeParse({
        ...common,
        reasonType: 'SOLD',
      }).success,
    ).toBe(false);
    expect(
      reduceInventoryStockSchema.safeParse({
        ...common,
        reason: '   ',
        reasonType: 'RETIRED',
      }).success,
    ).toBe(false);
    expect(
      reduceInventoryStockSchema.safeParse({
        ...common,
        reason: 'Too short',
        reasonType: 'INVENTORY_CORRECTION',
      }).success,
    ).toBe(false);
  });

  it('keeps inventory metadata narrow and prohibits direct quantity edits', () => {
    const input = {
      operationId: '00000000-0000-4000-8000-000000000000',
      internalNotes: 'Warehouse bay seven',
    };
    expect(updateInventoryMetadataSchema.parse(input)).toEqual(input);
    expect(
      updateInventoryMetadataSchema.safeParse({ ...input, totalQuantity: 30 })
        .success,
    ).toBe(false);
  });
});
