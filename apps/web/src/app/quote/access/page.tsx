import type { Metadata } from 'next';
import { QuoteAccessExchange } from '@/components/quote-access-exchange';
import { PublicFeatureUnavailable } from '@/components/public-feature-unavailable';
import { getPublicFeatures } from '@/lib/public-features';

export const metadata: Metadata = {
  title: 'Secure Quote Access',
  robots: { index: false, follow: false, nocache: true },
};
export default async function QuoteAccessPage() {
  const features = await getPublicFeatures();
  if (!features.customerOrderPortal)
    return <PublicFeatureUnavailable title="Customer quote access" />;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <QuoteAccessExchange />
    </main>
  );
}
