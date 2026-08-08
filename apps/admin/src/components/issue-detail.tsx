'use client';

import type { AdminRentalIssueResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function IssueDetail({
  canCreateMaintenance = false,
  id,
}: {
  canCreateMaintenance?: boolean;
  id: string;
}) {
  const [data, setData] = useState<AdminRentalIssueResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [internalReason, setInternalReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/issues/${id}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Issue could not be loaded.');
          setData((await response.json()) as AdminRentalIssueResponse);
        })
        .catch((value) =>
          setMessage(
            value instanceof Error
              ? value.message
              : 'Issue could not be loaded.',
          ),
        ),
    [id],
  );
  useEffect(() => void load(), [load]);
  async function resolve(
    outcome: 'ITEM_RETURNED' | 'REPAIRED' | 'WRITTEN_OFF' | 'PAID' | 'WAIVED',
  ) {
    if (!data || busy || !internalReason.trim()) return;
    if (
      !window.confirm(
        `Record ${outcome.replaceAll('_', ' ').toLowerCase()} for ${data.openQuantity} unresolved item(s)? This action is audited and cannot be deleted.`,
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    const returnResponse = await fetch(`/api/returns/${data.returnId}`, {
      cache: 'no-store',
    });
    if (!returnResponse.ok) {
      setBusy(false);
      return setMessage('Current return version could not be loaded.');
    }
    const currentReturn = (await returnResponse.json()) as { version: number };
    const physical = ['ITEM_RETURNED', 'REPAIRED', 'WRITTEN_OFF'].includes(
      outcome,
    );
    const target =
      outcome === 'WRITTEN_OFF'
        ? data.type === 'MISSING'
          ? 'LOST'
          : 'RETIRED'
        : 'RENTABLE';
    const response = await fetch(`/api/issues/${id}/resolutions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        expectedIssueVersion: data.version,
        expectedReturnVersion: currentReturn.version,
        outcome,
        quantity: data.openQuantity,
        resultingInventoryState: physical ? target : undefined,
        assessedCentsDelta: 0,
        paidCentsDelta:
          outcome === 'PAID'
            ? Math.round(Number(paymentAmount || '0') * 100)
            : 0,
        internalReason: internalReason.trim(),
      }),
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setBusy(false);
      return setMessage(payload.message ?? 'Issue could not be resolved.');
    }
    await load();
    setBusy(false);
    setInternalReason('');
    setMessage('Issue resolution recorded.');
  }
  if (!data) return <p aria-live="polite">{message ?? 'Loading issue...'}</p>;
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/issues">
          Back to issues
        </Link>
        <h1 className="mt-3 text-3xl font-bold">
          {data.type.replaceAll('_', ' ')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {data.orderNumber} · {data.returnNumber}
        </p>
      </header>
      <section className="rounded-xl border bg-card p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Status</dt>
            <dd>{data.status.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Unresolved</dt>
            <dd>
              {data.openQuantity} of {data.quantity}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Product</dt>
            <dd>{data.productName ?? 'Rental-level'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Asset</dt>
            <dd>{data.assetNumber ?? 'Bulk/not applicable'}</dd>
          </div>
        </dl>
        <p className="mt-5">{data.internalDescription}</p>
      </section>
      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm sm:col-span-2">
          Internal resolution reason
          <textarea
            className="min-h-24 rounded-md border bg-background px-3 py-2"
            maxLength={2000}
            onChange={(event) => setInternalReason(event.target.value)}
            required
            value={internalReason}
          />
        </label>
        <label className="grid gap-2 text-sm">
          Payment amount (CAD, when recording paid)
          <input
            className="rounded-md border bg-background px-3 py-2"
            min="0"
            onChange={(event) => setPaymentAmount(event.target.value)}
            step="0.01"
            type="number"
            value={paymentAmount}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {canCreateMaintenance &&
        data.status !== 'RESOLVED' &&
        ['DAMAGED', 'MAINTENANCE_REQUIRED'].includes(data.type) ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            href={`/maintenance/work-orders/new?sourceRentalIssueId=${encodeURIComponent(data.id)}`}
          >
            Create maintenance work order
          </Link>
        ) : null}
        {(data.type === 'MISSING'
          ? (['ITEM_RETURNED', 'WRITTEN_OFF', 'PAID', 'WAIVED'] as const)
          : ['DAMAGED', 'MAINTENANCE_REQUIRED'].includes(data.type)
            ? (['REPAIRED', 'WRITTEN_OFF', 'PAID', 'WAIVED'] as const)
            : (['PAID', 'WAIVED'] as const)
        ).map((outcome) => (
          <button
            className="rounded-md border px-3 py-2 text-sm"
            disabled={
              busy ||
              !internalReason.trim() ||
              (outcome === 'PAID' && Number(paymentAmount) <= 0)
            }
            key={outcome}
            onClick={() => void resolve(outcome)}
            type="button"
          >
            {busy ? 'Recording...' : outcome.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      {message ? <p aria-live="polite">{message}</p> : null}
    </div>
  );
}
