import type { Metadata } from 'next';

import { TrackRequestForm } from '@/components/track-request-form';

export const metadata: Metadata = {
  title: 'Track Rental Request',
  description: 'Open a rental request previously submitted from this browser.',
  robots: { index: false, follow: false, nocache: true },
};

export default function TrackRequestPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:py-20">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
          Private request tracking
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Track a rental request
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Enter the reference shown after submission.
        </p>
        <TrackRequestForm />
      </div>
    </div>
  );
}
