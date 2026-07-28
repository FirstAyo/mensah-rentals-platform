'use client';

import type {
  AdminRentalRequestRevisionResponse,
  RentalRequestRevisionComparisonResponse,
} from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import { GitCompareArrows, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function RentalRequestRevisions({ requestId }: { requestId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const revisions = useQuery<AdminRentalRequestRevisionResponse[]>({
    queryKey: ['rental-request-revisions', requestId],
    queryFn: async () => {
      const response = await fetch(
        `/api/rental-requests/${requestId}/revisions`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to load revision history.');
      return response.json() as Promise<AdminRentalRequestRevisionResponse[]>;
    },
  });
  const revisionId = selected ?? revisions.data?.[0]?.id ?? null;
  const comparison = useQuery<RentalRequestRevisionComparisonResponse>({
    queryKey: ['rental-request-comparison', requestId, revisionId],
    enabled: Boolean(revisionId && (revisions.data?.length ?? 0) > 1),
    queryFn: async () => {
      const response = await fetch(
        `/api/rental-requests/${requestId}/revisions/${revisionId}/comparison`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to compare revisions.');
      return response.json() as Promise<RentalRequestRevisionComparisonResponse>;
    },
  });

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby="revision-history-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="revision-history-title" className="text-xl font-semibold">
            Request revisions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable customer snapshots; the newest revision is operational.
          </p>
        </div>
        <GitCompareArrows className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      {revisions.isLoading ? (
        <p className="mt-4 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading revisions…
        </p>
      ) : null}
      {revisions.isError ? (
        <p role="alert" className="mt-4 text-destructive">
          Revision history is unavailable.
        </p>
      ) : null}
      {revisions.data?.length ? (
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="list"
          aria-label="Request revisions"
        >
          {revisions.data.map((revision, index) => (
            <button
              key={revision.id}
              role="listitem"
              type="button"
              onClick={() => setSelected(revision.id)}
              className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${revision.id === revisionId ? 'border-primary bg-accent' : ''}`}
            >
              Revision {revision.revisionNumber}
              {index === 0 ? ' · Current' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {comparison.data ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="font-semibold">Equipment changes</h3>
            <ul className="mt-3 space-y-2">
              {comparison.data.items.map((item) => (
                <li
                  className="rounded-lg border p-3 text-sm"
                  key={`${item.productSlug}-${item.kind}`}
                >
                  <span className="rounded bg-muted px-2 py-1 text-xs font-bold">
                    {item.kind.replaceAll('_', ' ')}
                  </span>
                  <strong className="mt-2 block">{item.productName}</strong>
                  <span className="text-muted-foreground">
                    Previous: {item.previousQuantity ?? 'Not requested'} ·
                    Current: {item.currentQuantity ?? 'Removed'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Request detail changes</h3>
            {comparison.data.fields.length ? (
              <dl className="mt-3 space-y-2">
                {comparison.data.fields.map((field) => (
                  <div
                    className="rounded-lg border p-3 text-sm"
                    key={field.field}
                  >
                    <dt className="font-semibold">
                      {field.field.replaceAll('_', ' ')}
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      Previous: {field.previousValue ?? 'Not provided'}
                    </dd>
                    <dd>Current: {field.currentValue ?? 'Not provided'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No request-detail fields changed.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
