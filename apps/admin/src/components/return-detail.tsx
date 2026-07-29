'use client';

import type { AdminRentalReturnResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function ReturnDetail({ id }: { id: string }) {
  const [data, setData] = useState<AdminRentalReturnResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/returns/${id}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Return could not be loaded.');
          setData((await response.json()) as AdminRentalReturnResponse);
        })
        .catch((value) =>
          setMessage(
            value instanceof Error
              ? value.message
              : 'Return could not be loaded.',
          ),
        ),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function command(action: 'reconcile' | 'complete') {
    if (!data || busy) return;
    if (
      !window.confirm(
        action === 'complete'
          ? 'Complete this rental? Completion is audited and requires all blocking issues to be resolved.'
          : 'Evaluate reconciliation using the current return and issue state?',
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/returns/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        expectedVersion: data.version,
      }),
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setBusy(false);
      return setMessage(payload.message ?? `${action} failed.`);
    }
    await load();
    setBusy(false);
    setMessage(
      action === 'complete' ? 'Rental completed.' : 'Reconciliation evaluated.',
    );
  }
  if (!data) return <p aria-live="polite">{message ?? 'Loading return...'}</p>;
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/returns">
          Back to returns
        </Link>
        <h1 className="mt-3 text-3xl font-bold">{data.returnNumber}</h1>
        <p className="mt-2 text-muted-foreground">
          {data.orderNumber} · {data.customerName} · {data.projectName}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Status', data.status.replaceAll('_', ' ')],
          ['Version', String(data.version)],
          ['Issues', String(data.issueCount)],
          ['Blocking', String(data.blockingIssueCount)],
        ].map(([label, value]) => (
          <div className="rounded-xl border bg-card p-4" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-semibold">Reconciliation quantities</h2>
        <div className="mt-4 grid gap-3">
          {data.items.map((item) => (
            <article className="rounded-lg border p-3" key={item.id}>
              <h3 className="font-semibold">{item.productName}</h3>
              <p className="mt-1 text-sm">
                Expected {item.expectedCheckedOutQuantity} · received{' '}
                {item.receivedQuantity} · rentable {item.rentableQuantity} ·
                damaged {item.damagedQuantity} · maintenance{' '}
                {item.maintenanceQuantity} · missing {item.missingQuantity} ·
                outstanding {item.outstandingQuantity}
              </p>
            </article>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border px-4 py-2"
          disabled={busy}
          onClick={() => void command('reconcile')}
          type="button"
        >
          {busy ? 'Working...' : 'Reconcile return'}
        </button>
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          disabled={busy}
          onClick={() => void command('complete')}
          type="button"
        >
          {busy ? 'Working...' : 'Complete rental'}
        </button>
        <Link className="rounded-md border px-4 py-2" href="/issues">
          View issues
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {['receipt', 'inspection', 'missing', 'damage', 'reconciliation'].map(
          (kind) => (
            <a
              className="underline"
              href={`/api/returns/${id}/${kind}-pdf`}
              key={kind}
            >
              {kind.replaceAll('-', ' ')} PDF
            </a>
          ),
        )}
      </div>
      {message ? <p aria-live="polite">{message}</p> : null}
    </div>
  );
}
