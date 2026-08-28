import type { ReactNode } from 'react';

import { PublicFeatureUnavailable } from '@/components/public-feature-unavailable';
import { getPublicFeatures } from '@/lib/public-features';

export default async function RentalRequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const features = await getPublicFeatures();
  return features.rentalRequests ? (
    children
  ) : (
    <PublicFeatureUnavailable title="Rental request access" />
  );
}
