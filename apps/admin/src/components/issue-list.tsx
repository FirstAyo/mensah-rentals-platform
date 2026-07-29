'use client';

import type { AdminRentalIssueResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function IssueList() {
  const [items, setItems] = useState<AdminRentalIssueResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      void fetch('/api/issues?page=1&pageSize=50', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Return issues could not be loaded.');
          const data = (await response.json()) as {
            items: AdminRentalIssueResponse[];
          };
          setItems(data.items);
        })
        .catch((value) =>
          setError(
            value instanceof Error
              ? value.message
              : 'Return issues could not be loaded.',
          ),
        ),
    [],
  );
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Return issues</h1>
        <p className="mt-2 text-muted-foreground">
          Missing, damaged, inspection, and reconciliation work. Financial
          fields are internal only.
        </p>
      </header>
      {!items ? (
        <p aria-live="polite">{error ?? 'Loading issues...'}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border bg-card p-6">
          No return issues need attention.
        </p>
      ) : (
        <div className="grid gap-3">
          {items.map((issue) => (
            <Link
              className="rounded-xl border bg-card p-4 hover:bg-muted/40"
              href={`/issues/${issue.id}`}
              key={issue.id}
            >
              <strong>{issue.type.replaceAll('_', ' ')}</strong>
              <span className="block text-sm text-muted-foreground">
                {issue.orderNumber} ·{' '}
                {issue.productName ?? 'Rental-level issue'} ·{' '}
                {issue.openQuantity} unresolved
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
