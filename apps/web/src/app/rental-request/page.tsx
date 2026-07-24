import type { Metadata } from 'next';

import { RentalRequestForm } from '@/components/rental-request-form';

export const metadata: Metadata = {
  title: 'Submit Rental Request',
  description:
    'Provide project details and submit your equipment request for staff review.',
  robots: { index: false, follow: false, nocache: true },
};

export default function RentalRequestPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Guest rental request
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Tell us about your project
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          No account is required. Staff will review your dates and desired
          quantities before any approval, reservation, or custom quote.
        </p>
      </div>
      <div className="mt-10">
        <RentalRequestForm />
      </div>
    </div>
  );
}
