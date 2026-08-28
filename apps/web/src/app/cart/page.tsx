import type { Metadata } from 'next';
import { RentalCart } from '@/components/rental-cart';
import { PublicFeatureUnavailable } from '@/components/public-feature-unavailable';
import { getPublicFeatures } from '@/lib/public-features';

export const metadata: Metadata = {
  title: 'Rental Cart',
  description:
    'Review desired equipment quantities before preparing a rental request.',
  alternates: { canonical: '/cart' },
  robots: { index: false, follow: false, nocache: true },
};

export default async function CartPage() {
  const features = await getPublicFeatures();
  if (!features.rentalRequests)
    return <PublicFeatureUnavailable title="Rental cart" />;
  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Guest rental cart
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Equipment your project needs
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Set desired quantities without viewing internal stock or reserving
          equipment. Your cart remains in this browser for up to 30 days.
        </p>
      </div>
      <div className="mt-10">
        <RentalCart />
      </div>
    </div>
  );
}
