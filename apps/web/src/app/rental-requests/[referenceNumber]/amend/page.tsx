import type { Metadata } from 'next';

import { RentalRequestAmendmentForm } from '@/components/rental-request-amendment-form';

export const metadata: Metadata = {
  title: 'Amend Rental Request',
  description: 'Privately submit changes to your rental request.',
  robots: { index: false, follow: false, nocache: true },
};

export default function AmendRentalRequestPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <RentalRequestAmendmentForm />
    </div>
  );
}
