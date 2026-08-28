import { SetMetadata } from '@nestjs/common';
import type { PlatformFeatureKey } from '@mensah-rentals/validation';

export const REQUIRED_FEATURE = Symbol('required-feature');

export interface RequiredFeatureMetadata {
  audience: 'ADMIN' | 'PUBLIC';
  key: PlatformFeatureKey;
}

export const RequireFeature = (
  key: PlatformFeatureKey,
  audience: 'ADMIN' | 'PUBLIC' = 'ADMIN',
) =>
  SetMetadata(REQUIRED_FEATURE, {
    audience,
    key,
  } satisfies RequiredFeatureMetadata);
