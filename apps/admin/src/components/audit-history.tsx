'use client';

import { Download, History, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { parseAuditResponse, type AuditResponse } from '@/lib/audit-types';
import { ReportNavigation } from './report-navigation';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AuditHistory({ canExport }: { canExport: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = searchParams.toString();
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(query);
        if (!params.has('page')) params.set('page', '1');
        if (!params.has('pageSize')) params.set('pageSize', '25');
        const response = await fetch(`/api/audit?${params}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error('Audit history could not be loaded.');
        const parsed = parseAuditResponse(await response.json());
        if (!parsed)
          throw new Error('Audit history returned an unsafe response.');
        setData(parsed);
      } catch (value) {
        if (value instanceof DOMException && value.name === 'AbortError')
          return;
        setData(null);
        setError(
          value instanceof Error
            ? value.message
            : 'Audit history could not be loaded.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.set('page', '1');
    router.push(`/reports/audit?${params}`);
  };
  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch('/api/audit/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(searchParams)),
      });
      if (!response.ok)
        throw new Error(
          'Audit CSV could not be created. Narrow the filters and try again.',
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = response.headers.get('content-disposition');
      link.href = url;
      link.download =
        disposition?.match(/^attachment; filename="([A-Za-z0-9._-]+)"$/)?.[1] ??
        'mensah-rentals-audit.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Audit CSV could not be created.',
      );
    } finally {
      setExporting(false);
    }
  };
  const page = Number(searchParams.get('page') ?? '1');
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Operational accountability
          </p>
          <h1 className="mt-2 text-3xl font-bold">Audit history</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Search immutable activity from authoritative operational records.
            Audit entries cannot be edited or deleted.
          </p>
        </div>
        {canExport ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 font-semibold disabled:opacity-60"
            disabled={exporting}
            onClick={() => void exportCsv()}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {exporting ? 'Preparing CSV…' : 'Export filtered CSV'}
          </button>
        ) : null}
      </header>
      <ReportNavigation availableReportKeys={[]} canViewAudit />
      <section
        aria-label="Audit filters"
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        <label className="relative sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">
            Search activity
          </span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3.5 left-3 h-4 w-4 text-muted-foreground"
          />
          <input
            className={`${field} pl-9`}
            maxLength={120}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Action or reference"
            type="search"
            value={searchParams.get('search') ?? ''}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Domain</span>
          <select
            className={field}
            onChange={(event) => update('domain', event.target.value)}
            value={searchParams.get('domain') ?? ''}
          >
            <option value="">All domains</option>
            {[
              'AUTH',
              'RENTAL_REQUEST',
              'QUOTE',
              'ORDER',
              'RESERVATION',
              'FULFILMENT',
              'RETURN',
              'RENTAL_ISSUE',
              'INVENTORY',
              'MAINTENANCE',
              'INSPECTION',
              'HOMEPAGE',
              'CATEGORY',
              'PRODUCT',
              'MEDIA',
              'RBAC',
              'REPORTING',
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Start date</span>
          <input
            className={field}
            onChange={(event) => update('startDate', event.target.value)}
            type="date"
            value={searchParams.get('startDate') ?? ''}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">End date</span>
          <input
            className={field}
            onChange={(event) => update('endDate', event.target.value)}
            type="date"
            value={searchParams.get('endDate') ?? ''}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Action</span>
          <input
            className={field}
            maxLength={100}
            onChange={(event) =>
              update('action', event.target.value.toUpperCase())
            }
            placeholder="REPORT_EXPORT_GENERATED"
            value={searchParams.get('action') ?? ''}
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Actor staff ID</span>
          <input
            className={field}
            maxLength={30}
            onChange={(event) => update('actorUserId', event.target.value)}
            placeholder="Exact internal ID"
            value={searchParams.get('actorUserId') ?? ''}
          />
        </label>
      </section>
      {error ? (
        <div className="rounded-xl border bg-card p-4" role="alert">
          {error}
          <button
            className="ml-3 min-h-11 font-semibold underline"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {loading ? (
        <div
          aria-live="polite"
          className="h-40 animate-pulse rounded-xl bg-muted"
          role="status"
        >
          <span className="sr-only">Loading audit history</span>
        </div>
      ) : null}
      {!loading && data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <History
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-muted-foreground"
          />
          <p className="mt-3 font-semibold">
            No audit activity matched your search.
          </p>
        </div>
      ) : null}
      {data?.items.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-4">Time</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Domain</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Activity</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr className="border-t" key={item.id}>
                    <td className="p-4">
                      {new Date(item.occurredAt).toLocaleString()}
                    </td>
                    <td className="p-4">{item.actor?.name ?? 'System'}</td>
                    <td className="p-4">{item.domain.replaceAll('_', ' ')}</td>
                    <td className="p-4">{item.action.replaceAll('_', ' ')}</td>
                    <td className="p-4">
                      <Link
                        className="font-medium underline underline-offset-4"
                        href={`/reports/audit/${encodeURIComponent(item.source)}/${encodeURIComponent(item.id)}`}
                      >
                        {item.summary}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {data.items.map((item) => (
              <article className="rounded-xl border bg-card p-4" key={item.id}>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold">
                    {item.domain.replaceAll('_', ' ')}
                  </span>
                  <time dateTime={item.occurredAt}>
                    {new Date(item.occurredAt).toLocaleString()}
                  </time>
                </div>
                <Link
                  className="mt-3 block font-medium underline"
                  href={`/reports/audit/${encodeURIComponent(item.source)}/${encodeURIComponent(item.id)}`}
                >
                  {item.summary}
                </Link>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.actor?.name ?? 'System'} ·{' '}
                  {item.action.replaceAll('_', ' ')}
                </p>
              </article>
            ))}
          </div>
          {data.meta.totalPages > 1 ? (
            <nav
              aria-label="Audit history pages"
              className="flex items-center justify-between gap-3"
            >
              <button
                className="min-h-11 rounded-lg border px-4 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => update('page', String(page - 1))}
                type="button"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <button
                className="min-h-11 rounded-lg border px-4 disabled:opacity-50"
                disabled={page >= data.meta.totalPages}
                onClick={() => update('page', String(page + 1))}
                type="button"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
