import 'server-only';

import type {
  AdminFeatureAvailabilityResponse,
  AdminFeatureSettingsResponse,
  PlatformFeatureKey,
} from '@mensah-rentals/types';
import { cookies } from 'next/headers';

import { getApiInternalUrl, getStaffSessionCookieName } from './auth-config';

export async function getAdminFeatureSettings(): Promise<AdminFeatureSettingsResponse> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getStaffSessionCookieName());
  const response = await fetch(
    `${getApiInternalUrl()}/admin/feature-settings`,
    {
      cache: 'no-store',
      headers: cookie ? { Cookie: `${cookie.name}=${cookie.value}` } : {},
    },
  );
  if (!response.ok) throw new Error('Feature settings could not be loaded.');
  return (await response.json()) as AdminFeatureSettingsResponse;
}

export async function getAdminFeatureAvailability(): Promise<AdminFeatureAvailabilityResponse> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getStaffSessionCookieName());
  const response = await fetch(
    `${getApiInternalUrl()}/admin/feature-settings/availability`,
    {
      cache: 'no-store',
      headers: cookie ? { Cookie: `${cookie.name}=${cookie.value}` } : {},
    },
  );
  if (!response.ok)
    throw new Error('Feature availability could not be loaded.');
  return (await response.json()) as AdminFeatureAvailabilityResponse;
}

export async function requireAdminFeature(key: PlatformFeatureKey) {
  const settings = await getAdminFeatureAvailability();
  const feature = settings.features.find((item) => item.key === key);
  return { available: feature?.available ?? false, feature, settings };
}
