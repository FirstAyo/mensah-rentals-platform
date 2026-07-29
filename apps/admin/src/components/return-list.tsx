'use client';

import type { AdminRentalReturnListResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function ReturnList() {
  const [data, setData] = useState<AdminRentalReturnListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const query = new URLSearchParams({ page: '1', pageSize: '50' });
    if (search.trim()) query.set('search', search.trim());
    void fetch(`/api/returns?${query}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Returns could not be loaded.');
        setData((await response.json()) as AdminRentalReturnListResponse);
      })
      .catch((value) =>
        setError(
          value instanceof Error
            ? value.message
            : 'Returns could not be loaded.',
        ),
      );
  }, [search]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Returns and reconciliation</h1>
        <p className="mt-2 text-muted-foreground">
          Receive equipment, inspect condition, and complete rentals without
          changing historical checkout evidence.
        </p>
      </header>
      <label className="block max-w-xl text-sm">
        Search returns
        <input
          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Return, order, or project"
        />
      </label>
      {!data ? (
        <p aria-live="polite">{error ?? 'Loading returns...'}</p>
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border bg-card p-6">
          No return records match this view.
        </p>
      ) : (
        <div className="grid gap-3">
          {data.items.map((item) => (
            <Link
              className="grid gap-2 rounded-xl border bg-card p-4 hover:bg-muted/40 sm:grid-cols-[1fr_auto]"
              href={`/returns/${item.id}`}
              key={item.id}
            >
              <span>
                <strong>{item.returnNumber}</strong>
                <span className="block text-sm text-muted-foreground">
                  {item.orderNumber} · {item.customerName} · {item.projectName}
                </span>
              </span>
              <span className="text-sm sm:text-right">
                {item.status.replaceAll('_', ' ')}
                <span className="block text-muted-foreground">
                  {item.blockingIssueCount} blocking issue(s)
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
