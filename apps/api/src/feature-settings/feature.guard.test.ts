import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FeatureGuard } from './feature.guard';
import { FeatureOperationCoordinator } from './feature-operation-coordinator';
import { REQUIRED_FEATURE } from './requires-feature.decorator';

describe('FeatureGuard', () => {
  it('enforces decorated features at the API boundary', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({
        audience: 'ADMIN',
        key: 'INVENTORY_TRACKING',
      }),
    };
    const features = {
      assertAvailable: vi.fn().mockRejectedValue(new ConflictException()),
    };
    const guard = new FeatureGuard(
      reflector as never,
      features as never,
      new FeatureOperationCoordinator(),
    );
    await expect(
      guard.canActivate({ getClass: vi.fn(), getHandler: vi.fn() } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      REQUIRED_FEATURE,
      expect.any(Array),
    );
  });

  it('does nothing on core routes without feature metadata', async () => {
    const features = { assertAvailable: vi.fn() };
    const guard = new FeatureGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as never,
      features as never,
      new FeatureOperationCoordinator(),
    );
    await expect(
      guard.canActivate({ getClass: vi.fn(), getHandler: vi.fn() } as never),
    ).resolves.toBe(true);
    expect(features.assertAvailable).not.toHaveBeenCalled();
  });
});
