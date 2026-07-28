'use client';

import type { PublicRentalChangeRequestResponse } from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type AdminChangeRequest = PublicRentalChangeRequestResponse & {
  customerExplanation?: string | null;
  referenceNumber: string;
  reviewVersion: number;
};

export function ChangeRequestDetail({
  canReview,
  id,
}: {
  canReview: boolean;
  id: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detail = useQuery<AdminChangeRequest>({
    queryKey: ['change-request', id],
    queryFn: async () => {
      const response = await fetch(`/api/change-requests/${id}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load change request.');
      return response.json();
    },
  });
  async function review(
    status: 'UNDER_REVIEW' | 'APPROVED_FOR_REQUOTE' | 'REJECTED',
  ) {
    if (!detail.data || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/change-requests/${id}/review-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: detail.data.reviewVersion,
          operationId: crypto.randomUUID(),
          status,
          internalNote: null,
          customerExplanation:
            status === 'REJECTED'
              ? 'Our team could not approve the proposed changes. Please contact Mensah Rentals for help.'
              : null,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Another staff member changed this request. Refresh and try again.'
            : 'Unable to update the review state.',
        );
      await detail.refetch();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update the review state.',
      );
    } finally {
      setPending(false);
    }
  }
  if (detail.isLoading)
    return (
      <p aria-live="polite" className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading change request…
      </p>
    );
  if (!detail.data || detail.isError)
    return (
      <div role="alert" className="rounded-xl border p-6">
        Formal change request is unavailable.
      </div>
    );
  const data = detail.data;
  return (
    <div className="space-y-6">
      <Link
        href="/change-requests"
        className="inline-flex min-h-11 items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to change requests
      </Link>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          {data.referenceNumber}
        </p>
        <h1 className="mt-2 text-3xl font-bold">Formal change request</h1>
        <p className="mt-2 text-muted-foreground">
          {data.source.replaceAll('_', ' ')} ·{' '}
          {data.status.replaceAll('_', ' ')}
        </p>
      </header>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Customer reason</h2>
        <p className="mt-3 whitespace-pre-wrap">{data.reason}</p>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Proposed request details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="font-semibold">Rental dates</dt>
            <dd className="text-muted-foreground">
              {data.rentalStartDate} to {data.rentalEndDate} (
              {data.requestedTimeZone})
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Fulfilment</dt>
            <dd className="text-muted-foreground">
              {data.fulfillmentMethod.replaceAll('_', ' ')}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Project</dt>
            <dd className="text-muted-foreground">
              {data.projectName} · {data.projectType} · {data.projectLocation}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Contact</dt>
            <dd className="text-muted-foreground">
              {data.contactFirstName} {data.contactLastName} ·{' '}
              {data.contactEmail} · {data.contactPhone}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Company</dt>
            <dd className="text-muted-foreground">
              {data.companyName ?? 'Not provided'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Delivery address</dt>
            <dd className="text-muted-foreground">
              {data.deliveryAddress ?? 'Not provided'}
            </dd>
          </div>
        </dl>
        {data.customerNotes ? (
          <div className="mt-4 border-t pt-4 text-sm">
            <h3 className="font-semibold">Customer notes</h3>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {data.customerNotes}
            </p>
          </div>
        ) : null}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Equipment changes</h2>
        <ul className="mt-3 divide-y">
          {data.items.map((item) => (
            <li
              className="grid min-h-14 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              key={item.id}
            >
              <div>
                <span className="rounded bg-muted px-2 py-1 text-xs font-bold">
                  {item.changeType.replaceAll('_', ' ')}
                </span>
                <strong className="mt-2 block">{item.productName}</strong>
              </div>
              <span className="text-sm">
                Previous: {item.previousQuantity ?? 'Not requested'} · Proposed:{' '}
                {item.proposedQuantity ?? 'Removed'}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      ) : null}
      {canReview ? (
        <section
          className="flex flex-wrap gap-3 rounded-xl border bg-card p-5"
          aria-label="Change request review actions"
        >
          <button
            disabled={pending}
            className="min-h-11 rounded-lg border px-4 font-semibold"
            onClick={() => void review('UNDER_REVIEW')}
          >
            Start review
          </button>
          <button
            disabled={pending}
            className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
            onClick={() => void review('APPROVED_FOR_REQUOTE')}
          >
            Approve for re-quote
          </button>
          <button
            disabled={pending}
            className="min-h-11 rounded-lg border px-4 font-semibold text-destructive"
            onClick={() => void review('REJECTED')}
          >
            Reject
          </button>
        </section>
      ) : null}
    </div>
  );
}
