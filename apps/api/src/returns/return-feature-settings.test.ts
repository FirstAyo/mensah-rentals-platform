import { ConflictException } from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import type { RecordReturnInput } from '@mensah-rentals/validation';
import { describe, expect, it, vi } from 'vitest';

import { AdminActiveRentalReturnController } from './return.controller';

const actor = { id: 'staff-id' } as StaffUserResponse;

function command(quantityDamaged: number): RecordReturnInput {
  return {
    expectedVersion: 0,
    items: [
      {
        activeRentalItemId: 'cm00000000000000000000001',
        externalQuantityMissing: 0,
        externalQuantityReceived: 0,
        quantityDamaged,
        quantityMaintenance: 0,
        quantityMissing: 0,
        quantityRentable: quantityDamaged ? 0 : 1,
        serializedAssets: [],
      },
    ],
    operationId: '6945d270-a0d3-4c7f-9364-4d7e8eae987d',
    receivedAt: '2026-08-27T12:00:00.000Z',
  };
}

describe('return feature settings', () => {
  it('blocks damaged intake before the return service can mutate inventory', async () => {
    const returns = { record: vi.fn() };
    const features = {
      assertAvailable: vi.fn().mockRejectedValue(new ConflictException()),
    };
    const controller = new AdminActiveRentalReturnController(
      returns as never,
      features as never,
    );
    await expect(
      controller.record(actor, 'cm00000000000000000000002', command(1)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(returns.record).not.toHaveBeenCalled();
  });

  it('keeps ordinary rentable intake available under the Returns feature', async () => {
    const returns = { record: vi.fn().mockResolvedValue({ id: 'return-id' }) };
    const features = { assertAvailable: vi.fn() };
    const controller = new AdminActiveRentalReturnController(
      returns as never,
      features as never,
    );
    await controller.record(actor, 'cm00000000000000000000002', command(0));
    expect(features.assertAvailable).not.toHaveBeenCalled();
    expect(returns.record).toHaveBeenCalledOnce();
  });
});
