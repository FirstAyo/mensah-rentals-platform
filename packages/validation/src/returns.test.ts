import { describe, expect, it } from 'vitest';

import { recordReturnSchema, resolveRentalIssueSchema } from './returns';

const operationId = '00000000-0000-4000-8000-000000000000';
const itemId = 'cm00000000000000000000000';
const assetId = 'cm00000000000000000000001';

describe('return validation', () => {
  it('separates physically received from confirmed missing quantities', () => {
    const parsed = recordReturnSchema.parse({
      operationId,
      expectedVersion: 0,
      receivedAt: '2026-07-31T12:00:00.000Z',
      items: [
        {
          activeRentalItemId: itemId,
          quantityRentable: 25,
          quantityDamaged: 2,
          quantityMaintenance: 0,
          quantityMissing: 3,
          serializedAssets: [],
        },
      ],
    });
    expect(parsed.items[0]?.quantityRentable).toBe(25);
    expect(parsed.items[0]?.quantityMissing).toBe(3);
  });

  it('rejects duplicate lines, empty actions, and serialized count mismatch', () => {
    const line = {
      activeRentalItemId: itemId,
      quantityRentable: 1,
      quantityDamaged: 0,
      quantityMaintenance: 0,
      quantityMissing: 0,
      serializedAssets: [],
    };
    expect(
      recordReturnSchema.safeParse({
        operationId,
        expectedVersion: 0,
        receivedAt: '2026-07-31T12:00:00.000Z',
        items: [line, line],
      }).success,
    ).toBe(false);
    expect(
      recordReturnSchema.safeParse({
        operationId,
        expectedVersion: 0,
        receivedAt: '2026-07-31T12:00:00.000Z',
        items: [{ ...line, quantityRentable: 0 }],
      }).success,
    ).toBe(false);
    expect(
      recordReturnSchema.safeParse({
        operationId,
        expectedVersion: 0,
        receivedAt: '2026-07-31T12:00:00.000Z',
        items: [
          {
            ...line,
            quantityRentable: 2,
            serializedAssets: [
              {
                activeRentalSerializedAssetId: assetId,
                disposition: 'RENTABLE',
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('does not allow payment or waiver to move inventory', () => {
    const common = {
      operationId,
      expectedIssueVersion: 0,
      expectedReturnVersion: 1,
      quantity: 1,
      assessedCentsDelta: 0,
      paidCentsDelta: 100,
      internalReason: 'Payment recorded.',
    };
    expect(
      resolveRentalIssueSchema.safeParse({
        ...common,
        outcome: 'PAID',
        resultingInventoryState: 'RENTABLE',
      }).success,
    ).toBe(false);
    expect(
      resolveRentalIssueSchema.safeParse({ ...common, outcome: 'PAID' })
        .success,
    ).toBe(true);
    expect(
      resolveRentalIssueSchema.safeParse({
        ...common,
        outcome: 'PAID',
        paidCentsDelta: 0,
      }).success,
    ).toBe(false);
    expect(
      resolveRentalIssueSchema.safeParse({ ...common, outcome: 'WAIVED' })
        .success,
    ).toBe(false);
    expect(
      resolveRentalIssueSchema.safeParse({
        ...common,
        outcome: 'WAIVED',
        paidCentsDelta: 0,
      }).success,
    ).toBe(true);
  });
});
