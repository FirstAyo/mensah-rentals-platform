'use client';

import type {
  AdminContactEnquiryListResponse,
  ContactEnquiryStatusResponse,
} from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const statuses: Array<ContactEnquiryStatusResponse | 'ALL'> = [
  'ALL',
  'NEW',
  'READ',
  'RESOLVED',
];

export function ContactEnquiryList() {
  const [data, setData] = useState<AdminContactEnquiryListResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContactEnquiryStatusResponse | 'ALL'>(
    'ALL',
  );
  const load = useCallback(() => {
    const query = new URLSearchParams({ page: '1', pageSize: '50' });
    if (search.trim()) query.set('search', search.trim());
    if (status !== 'ALL') query.set('status', status);
    setError(null);
    return fetch(`/api/contact-enquiries?${query}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Contact enquiries could not be loaded.');
        setData((await response.json()) as AdminContactEnquiryListResponse);
      })
      .catch((value) =>
        setError(
          value instanceof Error
            ? value.message
            : 'Contact enquiries could not be loaded.',
        ),
      );
  }, [search, status]);
  useEffect(() => void load(), [load]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Contact enquiries</h1>
        <p className="mt-2 text-muted-foreground">
          Customer messages submitted through the public contact page. No
          outbound email delivery is implied.
        </p>
      </header>
      <form
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_12rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="text-sm font-medium">
          Search
          <input
            className="mt-2 min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) => setSearch(event.target.value)}
            value={search}
          />
        </label>
        <label className="text-sm font-medium">
          Status
          <select
            className="mt-2 min-h-11 w-full rounded-md border bg-background px-3"
            onChange={(event) => setStatus(event.target.value as typeof status)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'All statuses' : item}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          type="submit"
        >
          Apply
        </button>
      </form>
      {!data ? (
        <p aria-live="polite">{error ?? 'Loading enquiries…'}</p>
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border bg-card p-6">
          No contact enquiries match these filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-4">Reference</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Received</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    className="border-b last:border-0 hover:bg-muted/30"
                    key={item.id}
                  >
                    <td className="p-4 font-medium">
                      <Link
                        className="underline decoration-muted-foreground/40 underline-offset-4"
                        href={`/contact-enquiries/${item.id}`}
                      >
                        {item.referenceNumber}
                      </Link>
                    </td>
                    <td className="p-4">
                      <span className="block font-medium">{item.name}</span>
                      <span className="text-muted-foreground">
                        {item.email}
                      </span>
                    </td>
                    <td className="p-4">
                      {item.enquiryType.replaceAll('_', ' ')}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-4">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && data ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status: ContactEnquiryStatusResponse;
}) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold">
      {status}
    </span>
  );
}
