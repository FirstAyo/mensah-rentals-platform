'use client';

import type { PublicRentalChangeRequestResponse } from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import { GitPullRequestArrow, Loader2 } from 'lucide-react';
import Link from 'next/link';

export function ChangeRequestList() {
  const list = useQuery<
    Array<PublicRentalChangeRequestResponse & { referenceNumber: string }>
  >({
    queryKey: ['change-requests'],
    queryFn: async () => {
      const response = await fetch('/api/change-requests?page=1&pageSize=50', {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error('Unable to load formal change requests.');
      return response.json();
    },
  });
  if (list.isLoading)
    return (
      <p aria-live="polite" className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading change requests…
      </p>
    );
  if (list.isError)
    return (
      <div role="alert" className="rounded-xl border p-6">
        Formal change requests could not be loaded.
      </div>
    );
  return (
    <div>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Customer changes
        </p>
        <h1 className="mt-2 text-3xl font-bold">Formal change requests</h1>
        <p className="mt-2 text-muted-foreground">
          Review proposals made after quote acceptance or order confirmation.
          Reviewing does not create a quote, order, or reservation.
        </p>
      </header>
      {list.data?.length ? (
        <div className="mt-7 grid gap-4 xl:grid-cols-2">
          {list.data.map((item) => (
            <Link
              href={`/change-requests/${item.id}`}
              key={item.id}
              className="rounded-xl border bg-card p-5 hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>{item.referenceNumber}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.source.replaceAll('_', ' ')} ·{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="mt-4 line-clamp-2 text-sm">{item.reason}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-xl border border-dashed bg-card p-10 text-center">
          <GitPullRequestArrow className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-xl font-semibold">
            No formal change requests
          </h2>
        </div>
      )}
    </div>
  );
}
