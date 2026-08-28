import type { Metadata } from 'next';
import { CustomerQuote } from '@/components/customer-quote';
import { PublicFeatureUnavailable } from '@/components/public-feature-unavailable';
import { getPublicFeatures } from '@/lib/public-features';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your Private Quote',
  description: 'Privately review and respond to your Mensah Rentals quote.',
  robots: { index: false, follow: false, nocache: true },
};
export default async function QuotePage() {
  const features = await getPublicFeatures();
  if (!features.customerOrderPortal)
    return <PublicFeatureUnavailable title="Customer quote access" />;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <CustomerQuote />
    </main>
  );
}
