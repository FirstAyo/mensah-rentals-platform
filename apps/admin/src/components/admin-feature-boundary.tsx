import type { ReactNode } from 'react';
import type { PlatformFeatureKey } from '@mensah-rentals/types';

import { FeatureDisabled } from './feature-disabled';
import { requireAdminFeature } from '@/lib/feature-settings-server';
import { requireStaffPermission } from '@/lib/auth-server';

export async function AdminFeatureBoundary({
  children,
  featureKey,
  label,
  permission,
}: {
  children: ReactNode;
  featureKey: PlatformFeatureKey;
  label: string;
  permission: string;
}) {
  await requireStaffPermission(permission);
  const { available } = await requireAdminFeature(featureKey);
  return available ? children : <FeatureDisabled label={label} />;
}
