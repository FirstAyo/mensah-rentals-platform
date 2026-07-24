'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { useTrackedRentalRequest } from '@/lib/use-rental-request';

export function RentalRequestTracker({
  referenceNumber,
}: {
  referenceNumber: string;
}) {
  const request = useTrackedRentalRequest(referenceNumber);

  if (request.isPending)
    return (
      <div
        aria-busy="true"
        className="rounded-2xl border bg-card p-8 text-center"
      >
        <Loader2 aria-hidden="true" className="mx-auto h-8 w-8 animate-spin" />
        <p className="mt-3 font-semibold">Loading your request...</p>
      </div>
    );

  if (request.isError)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-8 text-center">
        <AlertCircle
          aria-hidden="true"
          className="mx-auto h-9 w-9 text-red-700 dark:text-red-300"
        />
        <h2 className="mt-4 text-2xl font-semibold">Request not available</h2>
        <p className="mx-auto mt-2 max-w-xl leading-7 text-muted-foreground">
          This browser does not have access to that request, or the reference is
          no longer available.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          href="/track-request"
        >
          Try another reference
        </Link>
      </div>
    );

  const data = request.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section
        className="rounded-2xl border bg-card p-5 sm:p-7"
        aria-labelledby="request-status"
      >
        <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-primary" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
          Rental request received
        </p>
        <h1
          id="request-status"
          className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {data.status.label}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Reference:{' '}
          <strong className="text-foreground">{data.referenceNumber}</strong>
        </p>
        <p className="mt-5 leading-7 text-muted-foreground">
          Our staff will review your requested equipment and dates. This request
          is not an approval, reservation, or final quote.
        </p>
        <dl className="mt-7 grid gap-4 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd className="font-semibold">{data.projectName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rental period</dt>
            <dd className="font-semibold">
              {data.rentalStartDate} to {data.rentalEndDate}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fulfillment</dt>
            <dd className="font-semibold">
              {data.fulfillmentMethod.replaceAll('_', ' ')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="font-semibold">
              {new Date(data.submittedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>
      <aside className="rounded-2xl border bg-card p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold">Requested equipment</h2>
        <ul className="mt-4 divide-y">
          {data.items.map((item) => (
            <li
              className="flex justify-between gap-4 py-3 text-sm"
              key={item.productSlug}
            >
              <span>{item.productName}</span>
              <span className="font-semibold">
                {item.requestedQuantity} {item.rentalUnit}
              </span>
            </li>
          ))}
        </ul>
        <Link
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 font-semibold hover:bg-muted"
          href="/rentals"
        >
          Browse more equipment
        </Link>
      </aside>
    </div>
  );
}
