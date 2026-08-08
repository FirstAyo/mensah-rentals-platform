'use client';

import type {
  AdminQuoteSummaryResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

const column = createColumnHelper<AdminQuoteSummaryResponse>();

function QuoteListContent() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createdByUserId, setCreatedByUserId] = useState('');
  const [validUntilFrom, setValidUntilFrom] = useState('');
  const [validUntilTo, setValidUntilTo] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'total' | 'validUntil'>(
    'createdAt',
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const queryString = useMemo(() => {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      sortBy,
      sortDirection,
    });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    if (createdByUserId) query.set('createdByUserId', createdByUserId);
    if (validUntilFrom)
      query.set('validUntilFrom', new Date(validUntilFrom).toISOString());
    if (validUntilTo)
      query.set('validUntilTo', new Date(validUntilTo).toISOString());
    return query.toString();
  }, [
    createdByUserId,
    page,
    search,
    sortBy,
    sortDirection,
    status,
    validUntilFrom,
    validUntilTo,
  ]);
  const result = useQuery<PaginatedResponse<AdminQuoteSummaryResponse>>({
    queryKey: ['quotes', queryString],
    queryFn: async () => {
      const response = await fetch(`/api/quotes?${queryString}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Quotes could not be loaded');
      return response.json() as Promise<
        PaginatedResponse<AdminQuoteSummaryResponse>
      >;
    },
  });
  const columns = useMemo(
    () => [
      column.accessor('quoteNumber', { header: 'Quote' }),
      column.accessor('customerName', { header: 'Customer' }),
      column.accessor('status', { header: 'Status' }),
      column.accessor('totalCents', { header: 'Total' }),
      column.accessor('validUntil', { header: 'Valid until' }),
      column.accessor('createdAt', { header: 'Created' }),
    ],
    [],
  );
  const table = useReactTable({
    columns,
    data: result.data?.items ?? [],
    getCoreRowModel: getCoreRowModel(),
  });
  const data = result.data;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Commercial proposals
        </p>
        <h1 className="mt-2 text-3xl font-bold">Quotes</h1>
        <p className="mt-2 text-muted-foreground">
          Custom staff-priced proposals. Quotes do not reserve inventory or
          create orders.
        </p>
      </header>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="sr-only">Search quotes</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search quote, request, or customer"
            value={search}
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            {[
              'DRAFT',
              'SENT',
              'VIEWED',
              'ACCEPTED',
              'REJECTED',
              'EXPIRED',
              'SUPERSEDED',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm">Created by user ID</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setCreatedByUserId(event.target.value.trim());
              setPage(1);
            }}
            placeholder="Optional staff user ID"
            value={createdByUserId}
          />
        </label>
        <label>
          <span className="text-sm">Valid from</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            type="datetime-local"
            value={validUntilFrom}
            onChange={(event) => {
              setValidUntilFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="text-sm">Valid until</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            type="datetime-local"
            value={validUntilTo}
            onChange={(event) => {
              setValidUntilTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="text-sm">Sort by</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          >
            <option value="createdAt">Created date</option>
            <option value="total">Total</option>
            <option value="validUntil">Valid until</option>
          </select>
        </label>
        <label>
          <span className="text-sm">Sort direction</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            value={sortDirection}
            onChange={(event) =>
              setSortDirection(event.target.value as typeof sortDirection)
            }
          >
            <option value="desc">Newest / highest first</option>
            <option value="asc">Oldest / lowest first</option>
          </select>
        </label>
      </div>
      {result.isError ? (
        <p role="alert" className="rounded-xl border p-5">
          Quotes could not be loaded.
        </p>
      ) : null}
      {result.isPending ? (
        <p aria-live="polite" className="rounded-xl border p-8">
          Loading quotes…
        </p>
      ) : null}
      {data?.items.length === 0 ? (
        <p className="rounded-xl border p-8 text-muted-foreground">
          No quotes match these filters.
        </p>
      ) : null}
      <div className="grid gap-3">
        {table.getRowModel().rows.map(({ original: quote }) => (
          <Link
            className="grid gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/40 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto_auto_auto] xl:items-center"
            href={`/quotes/${quote.id}`}
            key={quote.id}
          >
            <div>
              <p className="font-semibold">{quote.quoteNumber}</p>
              <p className="text-sm text-muted-foreground">
                {quote.rentalRequestReference}
              </p>
            </div>
            <div>
              <p>{quote.customerName}</p>
              <p className="text-sm text-muted-foreground">
                Revision {quote.revisionNumber}
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {quote.status}
            </span>
            <p className="font-bold">{cad.format(quote.totalCents / 100)}</p>
            <p className="text-sm">
              Valid {new Date(quote.validUntil).toLocaleString()}
            </p>
            <p className="text-sm">
              Created {new Date(quote.createdAt).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
      {data ? (
        <nav
          aria-label="Quote pages"
          className="flex items-center justify-between"
        >
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {data.meta.page} of {Math.max(1, data.meta.totalPages)}
          </span>
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function QuoteList() {
  return <QuoteListContent />;
}
