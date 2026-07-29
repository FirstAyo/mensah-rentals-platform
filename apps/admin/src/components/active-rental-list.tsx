'use client';
import type { AdminActiveRentalListResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function ActiveRentalList() {
  const [data, setData] = useState<AdminActiveRentalListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(
        `/api/active-rentals?page=1&pageSize=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
        { cache: 'no-store' },
      )
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Active rentals could not be loaded.');
          setData((await response.json()) as AdminActiveRentalListResponse);
        })
        .catch((caught) =>
          setError(
            caught instanceof Error
              ? caught.message
              : 'Active rentals could not be loaded.',
          ),
        );
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-bold">Active rentals</h1>
        <p className="mt-2 text-muted-foreground">
          Equipment physically checked out and awaiting the future return
          workflow.
        </p>
      </header>
      <label className="block max-w-xl text-sm font-medium">
        Search orders, customers, or projects
        <input
          className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
          onChange={(event) => setSearch(event.target.value)}
          value={search}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {!data ? (
        <p aria-live="polite">Loading active rentals...</p>
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8">
          No active rentals match this view.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.items.map((item) => (
            <Link
              className="rounded-xl border bg-card p-5 hover:bg-muted/30"
              href={`/active-rentals/${item.id}`}
              key={item.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{item.orderNumber}</h2>
                  <p>{item.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.projectName}
                  </p>
                </div>
                <span className="rounded-full border px-3 py-1 text-sm font-semibold">
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <dt>Expected return</dt>
                <dd
                  className={
                    item.overdue
                      ? 'text-right font-semibold text-destructive'
                      : 'text-right'
                  }
                >
                  {new Date(item.expectedReturnAt).toLocaleString()}
                  {item.overdue ? ' · overdue' : ''}
                </dd>
                <dt>Method</dt>
                <dd className="text-right">
                  {item.fulfilmentMethod.replaceAll('_', ' ')}
                </dd>
                <dt>Equipment lines</dt>
                <dd className="text-right">{item.itemCount}</dd>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
