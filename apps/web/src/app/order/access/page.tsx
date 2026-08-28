import type { Metadata } from 'next';

import { OrderAccessExchange } from '@/components/order-access-exchange';
import { PublicFeatureUnavailable } from '@/components/public-feature-unavailable';
import { getPublicFeatures } from '@/lib/public-features';

export const metadata: Metadata = {
  title: 'Secure Order Access',
  robots: { index: false, follow: false, nocache: true },
};

export default async function OrderAccessPage() {
  const features = await getPublicFeatures();
  if (!features.customerOrderPortal)
    return <PublicFeatureUnavailable title="Customer order access" />;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <OrderAccessExchange />
    </main>
  );
}
