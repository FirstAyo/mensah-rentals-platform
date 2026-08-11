'use client';

import { Download, FileBarChart, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  parseReportResponse,
  REPORT_DEFINITIONS,
  type ReportKey,
  type ReportMetric,
  type ReportResponse,
} from '@/lib/reporting-types';
import { ReportNavigation } from './report-navigation';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const presets = [
  ['TODAY', 'Today'],
  ['LAST_7_DAYS', 'Last 7 days'],
  ['LAST_30_DAYS', 'Last 30 days'],
  ['THIS_MONTH', 'This month'],
  ['PREVIOUS_MONTH', 'Previous month'],
  ['THIS_YEAR', 'This year'],
  ['CUSTOM', 'Custom range'],
] as const;

export function metricValue(metric: ReportMetric) {
  if (metric.value === null) return 'Not available';
  if (metric.format === 'PERCENT' && typeof metric.value === 'number')
    return `${metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (metric.format === 'MONEY' && metric.currency) {
    const raw = String(metric.value);
    if (/^-?\d+$/.test(raw)) {
      const cents = BigInt(raw);
      const safe = Number(cents) / 100;
      if (Number.isSafeInteger(Number(cents)))
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: metric.currency,
        }).format(safe);
      const sign = cents < 0n ? '-' : '';
      const absolute = cents < 0n ? -cents : cents;
      const whole = (absolute / 100n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${metric.currency} ${sign}${whole}.${(absolute % 100n).toString().padStart(2, '0')}`;
    }
    return 'Not available';
  }
  return typeof metric.value === 'number'
    ? metric.value.toLocaleString()
    : metric.value;
}

function safeFilename(disposition: string | null, fallback: string) {
  const match = disposition?.match(
    /^attachment; filename="([A-Za-z0-9._-]+)"$/,
  );
  return match?.[1] ?? fallback;
}

function ReportChart({ series }: { series: ReportResponse['series'][number] }) {
  const maximum = Math.max(1, ...series.points.map(({ value }) => value));
  return (
    <figure className="min-w-0 rounded-xl border border-border bg-card p-4">
      <figcaption className="font-semibold">{series.label}</figcaption>
      {series.description ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {series.description}
        </p>
      ) : null}
      <div
        aria-label={`${series.label} chart`}
        className="mt-5 flex h-48 items-end gap-1 overflow-hidden border-b border-l border-border px-2 pt-2"
        role="img"
      >
        {series.points.map((point) => (
          <div
            className="min-w-1 flex-1 rounded-t bg-primary"
            key={`${point.date}-${point.value}`}
            style={{ height: `${Math.max(2, (point.value / maximum) * 100)}%` }}
            title={`${point.date}: ${point.value}`}
          />
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold underline underline-offset-4">
          View chart data
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((point) => (
                <tr className="border-t border-border" key={point.date}>
                  <td className="p-2">{point.date}</td>
                  <td className="p-2 tabular-nums">{point.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function ReportView({
  reportKey,
  canExport,
  canViewAudit,
  availableReportKeys,
}: {
  reportKey: ReportKey;
  canExport: boolean;
  canViewAudit: boolean;
  availableReportKeys: readonly ReportKey[];
}) {
  const definition = REPORT_DEFINITIONS[reportKey];
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const preset = searchParams.get('preset') ?? 'LAST_30_DAYS';
  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const requestQuery = useMemo(() => {
    const query = new URLSearchParams(searchParams);
    if (!query.has('preset')) query.set('preset', 'LAST_30_DAYS');
    if (reportKey !== 'overview') {
      if (!query.has('page')) query.set('page', '1');
      if (!query.has('pageSize')) query.set('pageSize', '25');
    }
    return query.toString();
  }, [reportKey, searchParams]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/reports/${reportKey}?${requestQuery}`,
          {
            cache: 'no-store',
            signal,
          },
        );
        if (!response.ok) throw new Error('This report could not be loaded.');
        const parsed = parseReportResponse(await response.json());
        if (!parsed)
          throw new Error('This report returned an unsafe response.');
        setData(parsed);
      } catch (value) {
        if (value instanceof DOMException && value.name === 'AbortError')
          return;
        setData(null);
        setError(
          value instanceof Error
            ? value.message
            : 'This report could not be loaded.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [reportKey, requestQuery],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const update = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    if (!('page' in changes)) query.set('page', '1');
    router.push(`${pathname}?${query}`);
  };

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const filters = Object.fromEntries(new URLSearchParams(requestQuery));
      const response = await fetch(`/api/reports/${reportKey}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          body?.message ??
            'The CSV export could not be created. Narrow the selected filters and try again.',
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = safeFilename(
        response.headers.get('content-disposition'),
        `mensah-rentals-${reportKey}.csv`,
      );
      link.click();
      URL.revokeObjectURL(url);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'The CSV export could not be created.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Operational intelligence
          </p>
          <h1 className="mt-2 text-3xl font-bold">{definition.title}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {definition.description}
          </p>
        </div>
        {canExport && reportKey !== 'overview' ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-semibold disabled:opacity-60"
            disabled={exporting}
            onClick={() => void exportCsv()}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            {exporting ? 'Preparing CSV…' : 'Export filtered CSV'}
          </button>
        ) : null}
      </header>
      <ReportNavigation
        availableReportKeys={availableReportKeys}
        canViewAudit={canViewAudit}
      />
      <section
        aria-labelledby="report-filters"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 className="font-semibold" id="report-filters">
          Report period
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className="mb-1 block text-sm font-medium">Date preset</span>
            <select
              className={field}
              onChange={(event) => update({ preset: event.target.value })}
              value={preset}
            >
              {presets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {preset === 'CUSTOM' ? (
            <>
              <label>
                <span className="mb-1 block text-sm font-medium">
                  Start date
                </span>
                <input
                  className={field}
                  max={endDate || undefined}
                  onChange={(event) =>
                    update({ startDate: event.target.value })
                  }
                  type="date"
                  value={startDate}
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium">End date</span>
                <input
                  className={field}
                  min={startDate || undefined}
                  onChange={(event) => update({ endDate: event.target.value })}
                  type="date"
                  value={endDate}
                />
              </label>
            </>
          ) : null}
          {reportKey !== 'overview' ? (
            <label>
              <span className="mb-1 block text-sm font-medium">Search</span>
              <input
                className={field}
                maxLength={120}
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Reference, customer or item"
                type="search"
                value={searchParams.get('search') ?? ''}
              />
            </label>
          ) : null}
          {reportKey === 'rental-requests' ? (
            <ReportSelect
              label="Request status"
              onChange={(value) => update({ status: value })}
              options={[
                'SUBMITTED',
                'RE_REVIEW_REQUIRED',
                'UNDER_REVIEW',
                'APPROVED',
                'PARTIALLY_APPROVED',
                'REJECTED',
              ]}
              value={searchParams.get('status') ?? ''}
            />
          ) : null}
          {reportKey === 'quotes-orders' ? (
            <>
              <ReportSelect
                label="Record type"
                onChange={(value) => update({ recordType: value })}
                options={['ALL', 'QUOTE', 'ORDER']}
                value={searchParams.get('recordType') ?? 'ALL'}
              />
              <ReportSelect
                label="Quote status"
                onChange={(value) => update({ quoteStatus: value })}
                options={[
                  'DRAFT',
                  'SENT',
                  'VIEWED',
                  'ACCEPTED',
                  'REJECTED',
                  'EXPIRED',
                  'SUPERSEDED',
                ]}
                value={searchParams.get('quoteStatus') ?? ''}
              />
            </>
          ) : null}
          {reportKey === 'rentals-returns' ? (
            <>
              <ReportSelect
                label="Record type"
                onChange={(value) => update({ recordType: value })}
                options={['ALL', 'ACTIVE_RENTAL', 'RETURN']}
                value={searchParams.get('recordType') ?? 'ALL'}
              />
              <ReportSelect
                label="Overdue"
                onChange={(value) => update({ overdue: value })}
                options={['true', 'false']}
                value={searchParams.get('overdue') ?? ''}
              />
            </>
          ) : null}
          {reportKey === 'inventory' ? (
            <>
              <ReportSelect
                label="Tracking mode"
                onChange={(value) => update({ trackingMode: value })}
                options={['BULK', 'SERIALIZED']}
                value={searchParams.get('trackingMode') ?? ''}
              />
              <ReportSelect
                label="Movement action"
                onChange={(value) => update({ action: value })}
                options={[
                  'INITIAL_STOCK',
                  'MANUAL_ADJUSTMENT',
                  'ASSET_CREATED',
                  'STOCK_ADDED',
                  'STOCK_REDUCED',
                  'CHECKOUT',
                  'RETURN_TO_RENTABLE',
                  'RETURN_TO_DAMAGED',
                  'RETURN_TO_MAINTENANCE',
                  'MARK_MISSING',
                  'RECOVER_MISSING_TO_RENTABLE',
                  'RECOVER_MISSING_TO_DAMAGED',
                  'RECOVER_MISSING_TO_MAINTENANCE',
                  'REPAIR_COMPLETE',
                  'WRITE_OFF',
                  'ENTER_MAINTENANCE',
                  'MAINTENANCE_RETURN_TO_SERVICE',
                  'MAINTENANCE_REMAINS_DAMAGED',
                  'MAINTENANCE_CANCELLED_RELEASE',
                ]}
                value={searchParams.get('action') ?? ''}
              />
              <ReportTextFilter
                label="Product ID"
                onChange={(value) => update({ productId: value })}
                value={searchParams.get('productId') ?? ''}
              />
              <ReportTextFilter
                label="Category ID"
                onChange={(value) => update({ categoryId: value })}
                value={searchParams.get('categoryId') ?? ''}
              />
            </>
          ) : null}
          {reportKey === 'maintenance' ? (
            <>
              <ReportSelect
                label="Record type"
                onChange={(value) => update({ recordType: value })}
                options={['ALL', 'WORK_ORDER', 'INSPECTION']}
                value={searchParams.get('recordType') ?? 'ALL'}
              />
              <ReportSelect
                label="Status"
                onChange={(value) => update({ status: value })}
                options={[
                  'OPEN',
                  'ASSIGNED',
                  'IN_PROGRESS',
                  'WAITING_FOR_PARTS',
                  'READY_FOR_INSPECTION',
                  'COMPLETED',
                  'CANCELLED',
                  'SCHEDULED',
                  'PASSED',
                  'FAILED',
                ]}
                value={searchParams.get('status') ?? ''}
              />
              <ReportSelect
                label="Priority"
                onChange={(value) => update({ priority: value })}
                options={['LOW', 'NORMAL', 'HIGH', 'URGENT']}
                value={searchParams.get('priority') ?? ''}
              />
            </>
          ) : null}
          <button
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 font-semibold"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
          </button>
        </div>
        {data ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {data.range.label ??
              `${data.range.startDate} to ${data.range.endDate}`}{' '}
            · {data.range.timeZone}
          </p>
        ) : null}
      </section>
      {reportKey === 'quotes-orders' ? (
        <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <strong>Commercial values are not revenue.</strong> Quoted,
          accepted-quote and confirmed-order values are snapshots. Payments and
          collected revenue are not implemented.
        </p>
      ) : null}
      {error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-card p-4"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-2 min-h-11 font-semibold underline"
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
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          role="status"
        >
          {[0, 1, 2, 3].map((item) => (
            <div
              className="h-32 animate-pulse rounded-xl bg-muted"
              key={item}
            />
          ))}
          <span className="sr-only">Loading report</span>
        </div>
      ) : null}
      {!loading && data ? (
        <>
          <section
            aria-label="Report metrics"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {data.metrics.map((metric) => (
              <article
                className="rounded-xl border border-border bg-card p-5"
                key={metric.key}
              >
                <p className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-3 text-3xl font-bold tabular-nums">
                  {metricValue(metric)}
                </p>
                {metric.description ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {metric.description}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
          {data.series.length ? (
            <section
              aria-label="Report trends"
              className="grid min-w-0 gap-4 xl:grid-cols-2"
            >
              {data.series.map((series) => (
                <ReportChart key={series.key} series={series} />
              ))}
            </section>
          ) : null}
          {reportKey !== 'overview' ? (
            <ReportRows
              data={data}
              empty={definition.empty}
              page={page}
              update={update}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function filterLabel(value: string) {
  if (value === 'true') return 'Overdue only';
  if (value === 'false') return 'Not overdue';
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function ReportSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        className={field}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {!options.includes('ALL') ? <option value="">All</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {filterLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportTextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        className={field}
        maxLength={30}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Exact internal ID"
        value={value}
      />
    </label>
  );
}

function ReportRows({
  data,
  empty,
  page,
  update,
}: {
  data: ReportResponse;
  empty: string;
  page: number;
  update: (changes: Record<string, string | null>) => void;
}) {
  const rows = data.items ?? [];
  if (!rows.length)
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <FileBarChart
          aria-hidden="true"
          className="mx-auto h-8 w-8 text-muted-foreground"
        />
        <p className="mt-3 font-semibold">{empty}</p>
      </div>
    );
  return (
    <section aria-labelledby="report-results">
      <h2 className="text-xl font-semibold" id="report-results">
        Report results
      </h2>
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="p-4">Reference</th>
              <th className="p-4">Record</th>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-border" key={row.id}>
                <td className="p-4 font-semibold">
                  {row.href ? (
                    <Link
                      className="underline underline-offset-4"
                      href={row.href}
                    >
                      {row.reference}
                    </Link>
                  ) : (
                    row.reference
                  )}
                </td>
                <td className="p-4">
                  {row.title}
                  {row.subtitle ? (
                    <span className="block text-xs text-muted-foreground">
                      {row.subtitle}
                    </span>
                  ) : null}
                </td>
                <td className="p-4">{row.status ?? '—'}</td>
                <td className="p-4">
                  {row.occurredAt
                    ? new Date(row.occurredAt).toLocaleString()
                    : '—'}
                </td>
                <td className="p-4">
                  {row.fields.map((field) => (
                    <span className="block" key={field.label}>
                      <span className="text-muted-foreground">
                        {field.label}:
                      </span>{' '}
                      {field.value}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-3 md:hidden">
        {rows.map((row) => (
          <article className="rounded-xl border bg-card p-4" key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">
                {row.href ? (
                  <Link className="underline" href={row.href}>
                    {row.reference}
                  </Link>
                ) : (
                  row.reference
                )}
              </p>
              <span>{row.status}</span>
            </div>
            <h3 className="mt-2 font-medium">{row.title}</h3>
            {row.fields.map((field) => (
              <p className="mt-1 text-sm" key={field.label}>
                <span className="text-muted-foreground">{field.label}:</span>{' '}
                {field.value}
              </p>
            ))}
          </article>
        ))}
      </div>
      {data.meta && data.meta.totalPages > 1 ? (
        <nav
          aria-label="Report result pages"
          className="mt-4 flex items-center justify-between gap-3"
        >
          <button
            className="min-h-11 rounded-lg border px-4 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) })}
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
            onClick={() => update({ page: String(page + 1) })}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
