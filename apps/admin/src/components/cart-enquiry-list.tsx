'use client';

import type {
  AdminCartEnquiryListResponse,
  CartEnquiryStatusResponse,
  OutboundEmailStatusResponse,
} from '@mensah-rentals/types';
import { Mail, PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type StatusFilter = CartEnquiryStatusResponse | 'ALL';
type DeliveryFilter = OutboundEmailStatusResponse | 'ALL';

const enquiryStatuses: StatusFilter[] = ['ALL', 'NEW', 'READ', 'RESOLVED'];
const deliveryStatuses: DeliveryFilter[] = [
  'ALL',
  'QUEUED',
  'PROCESSING',
  'SENT',
  'FAILED',
];

export function CartEnquiryList() {
  const [data, setData] = useState<AdminCartEnquiryListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryFilter>('ALL');
  const [filters, setFilters] = useState({
    search: '',
    status: 'ALL' as StatusFilter,
    deliveryStatus: 'ALL' as DeliveryFilter,
  });

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (filters.search) query.set('search', filters.search);
    if (filters.status !== 'ALL') query.set('status', filters.status);
    if (filters.deliveryStatus !== 'ALL')
      query.set('deliveryStatus', filters.deliveryStatus);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cart-enquiries?${query}`, {
        cache: 'no-store',
      });
      const result = (await response.json().catch(() => null)) as
        | AdminCartEnquiryListResponse
        | { message?: string }
        | null;
      if (!response.ok || !result || !('items' in result))
        throw new Error(
          result && 'message' in result && result.message
            ? result.message
            : 'Cart enquiries could not be loaded.',
        );
      setData(result);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Cart enquiries could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Customer workflow
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Cart enquiries
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Review structured rental enquiries and monitor delivery of the
            company notification email. These records are enquiries, not
            confirmed rental requests or orders.
          </p>
        </div>
        {data ? (
          <div className="rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="font-semibold">{data.meta.total}</span>{' '}
            <span className="text-muted-foreground">matching enquiries</span>
          </div>
        ) : null}
      </header>

      <form
        className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilters({
            deliveryStatus,
            search: search.trim(),
            status,
          });
        }}
      >
        <label className="text-sm font-medium">
          Search
          <input
            className="mt-2 min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Reference, name, email, or company"
            value={search}
          />
        </label>
        <label className="text-sm font-medium">
          Enquiry status
          <select
            className="mt-2 min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            {enquiryStatuses.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'All statuses' : title(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Email delivery
          <select
            className="mt-2 min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) =>
              setDeliveryStatus(event.target.value as DeliveryFilter)
            }
            value={deliveryStatus}
          >
            {deliveryStatuses.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'All delivery states' : title(item)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="submit"
        >
          Apply filters
        </button>
      </form>

      {loading && !data ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : data?.items.length === 0 ? (
        <EmptyState />
      ) : data ? (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-4">Reference</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Requested units</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Email delivery</th>
                    <th className="p-4">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      className="border-b last:border-0 hover:bg-muted/30"
                      key={item.id}
                    >
                      <td className="p-4 font-semibold">
                        <Link
                          className="underline decoration-muted-foreground/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          href={`/enquiries/${item.id}`}
                        >
                          {item.referenceNumber}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span className="block font-medium">
                          {item.customerName}
                        </span>
                        <span className="text-muted-foreground">
                          {item.contactEmail}
                        </span>
                      </td>
                      <td className="p-4 tabular-nums">
                        {item.requestedUnitCount}
                      </td>
                      <td className="p-4">
                        <EnquiryStatusBadge status={item.status} />
                      </td>
                      <td className="p-4">
                        <DeliveryStatusBadge status={item.deliveryStatus} />
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <nav
            aria-label="Cart enquiry pagination"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">
              Page {data.meta.page} of {Math.max(1, data.meta.totalPages)}
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-md border bg-card px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading || data.meta.page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-11 rounded-md border bg-card px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  loading ||
                  data.meta.totalPages === 0 ||
                  data.meta.page >= data.meta.totalPages
                }
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function EnquiryStatusBadge({
  status,
}: {
  status: CartEnquiryStatusResponse;
}) {
  return <Badge status={status}>{title(status)}</Badge>;
}

export function DeliveryStatusBadge({
  status,
}: {
  status: OutboundEmailStatusResponse;
}) {
  return <Badge status={status}>{title(status)}</Badge>;
}

function Badge({
  children,
  status,
}: {
  children: string;
  status: CartEnquiryStatusResponse | OutboundEmailStatusResponse;
}) {
  const tone =
    status === 'SENT' || status === 'RESOLVED'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'FAILED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : status === 'PROCESSING' || status === 'READ'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <div aria-live="polite" className="rounded-xl border bg-card p-6">
      Loading cart enquiries…
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <PackageSearch
        aria-hidden="true"
        className="mx-auto h-8 w-8 text-muted-foreground"
      />
      <h2 className="mt-4 text-lg font-semibold">No cart enquiries found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        New customer email enquiries will appear here when they are submitted.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-destructive/40 bg-card p-6"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Mail aria-hidden="true" className="mt-0.5 h-5 w-5 text-destructive" />
        <div>
          <h2 className="font-semibold">Cart enquiries are unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <button
            className="mt-4 min-h-11 rounded-md border px-4 text-sm font-medium"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function title(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
