'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { parseAuditEntry, type AuditEntry } from '@/lib/audit-types';

export function AuditDetail({ id, source }: { id: string; source: string }) {
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/audit/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
      {
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Audit activity could not be loaded.');
        const parsed = parseAuditEntry(await response.json());
        if (!parsed)
          throw new Error('Audit activity returned an unsafe response.');
        setEntry(parsed);
      })
      .catch((value) => {
        if (!(value instanceof DOMException && value.name === 'AbortError'))
          setError(
            value instanceof Error
              ? value.message
              : 'Audit activity could not be loaded.',
          );
      });
    return () => controller.abort();
  }, [id, source]);
  if (error)
    return (
      <div className="rounded-xl border bg-card p-6" role="alert">
        {error}
      </div>
    );
  if (!entry)
    return (
      <div
        aria-live="polite"
        className="h-48 animate-pulse rounded-xl bg-muted"
        role="status"
      >
        <span className="sr-only">Loading audit activity</span>
      </div>
    );
  const values = [
    ['Event time', new Date(entry.occurredAt).toLocaleString()],
    ['Actor', entry.actor?.name ?? 'System'],
    ['Domain', entry.domain.replaceAll('_', ' ')],
    ['Action', entry.action.replaceAll('_', ' ')],
    ['Source', entry.source],
    ['Entity type', entry.entity?.type ?? '—'],
    ['Reference', entry.entity?.reference ?? '—'],
  ];
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex min-h-11 items-center gap-2 font-semibold underline"
        href="/reports/audit"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to audit history
      </Link>
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Immutable activity
        </p>
        <h1 className="mt-2 text-3xl font-bold">Audit detail</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          This record is read-only. Sensitive request bodies, credentials and
          internal secrets are never shown.
        </p>
      </header>
      <section
        aria-labelledby="audit-summary"
        className="rounded-xl border bg-card p-5"
      >
        <h2 className="text-xl font-semibold" id="audit-summary">
          {entry.summary}
        </h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {values.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
