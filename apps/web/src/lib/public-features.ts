import 'server-only';

import type { PublicPlatformCapabilitiesResponse } from '@mensah-rentals/types';

const defaults: PublicPlatformCapabilitiesResponse = {
  cartSubmissionsAvailable: true,
  customerSubmissionMode: 'EMAIL_INQUIRY',
  customerOrderPortal: false,
  rentalRequests: false,
};

export async function getPublicFeatures(): Promise<PublicPlatformCapabilitiesResponse> {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/public/features`,
      { cache: 'no-store' },
    );
    if (!response.ok) return defaults;
    const value =
      (await response.json()) as Partial<PublicPlatformCapabilitiesResponse>;
    return {
      cartSubmissionsAvailable: value.cartSubmissionsAvailable !== false,
      customerSubmissionMode:
        value.customerSubmissionMode === 'PLATFORM_REQUEST'
          ? 'PLATFORM_REQUEST'
          : 'EMAIL_INQUIRY',
      customerOrderPortal: value.customerOrderPortal === true,
      rentalRequests: value.rentalRequests === true,
    };
  } catch {
    return defaults;
  }
}
