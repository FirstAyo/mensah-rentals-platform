import type { Metadata } from 'next';

import { RentalRequestTracker } from '@/components/rental-request-tracker';

export const metadata: Metadata = {
  title: 'Rental Request Status',
  description:
    'Privately view the status of a rental request submitted from this browser.',
  robots: { index: false, follow: false, nocache: true },
};

export default async function RentalRequestStatusPage({
  params,
}: {
  params: Promise<{ referenceNumber: string }>;
}) {
  const { referenceNumber } = await params;
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <RentalRequestTracker referenceNumber={referenceNumber.toUpperCase()} />
    </div>
  );
}
