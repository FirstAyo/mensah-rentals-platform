'use client';
import type { AdminActiveRentalDetailResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ReturnIntakePanel } from './return-intake-panel';
export function ActiveRentalDetail({ id }: { id: string }) {
  const [data, setData] = useState<AdminActiveRentalDetailResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch(`/api/active-rentals/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Active rental could not be loaded.');
        setData((await r.json()) as AdminActiveRentalDetailResponse);
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : 'Active rental could not be loaded.',
        ),
      );
  }, [id]);
  if (!data)
    return <p aria-live="polite">{error ?? 'Loading active rental...'}</p>;
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/active-rentals">
          Back to active rentals
        </Link>
        <h1 className="mt-3 text-3xl font-bold">{data.orderNumber}</h1>
        <p className="mt-2 text-muted-foreground">
          {data.customerName} · {data.projectName}
        </p>
      </header>
      <p className="rounded-xl border bg-muted/40 p-4">{data.notice}</p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Status', data.status.replaceAll('_', ' ')],
          ['Checked out', new Date(data.checkedOutAt).toLocaleString()],
          ['Expected return', new Date(data.expectedReturnAt).toLocaleString()],
          ['Method', data.fulfilmentMethod.replaceAll('_', ' ')],
        ].map(([label, value]) => (
          <div className="rounded-xl border bg-card p-4" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Checked-out equipment</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.items.map((item) => (
            <article className="rounded-lg border p-4" key={item.productName}>
              <h3 className="font-semibold">{item.productName}</h3>
              <p className="text-sm">
                {item.checkedOutQuantity} {item.rentalUnit}
              </p>
              {item.serializedAssets.length ? (
                <ul className="mt-2 text-xs text-muted-foreground">
                  {item.serializedAssets.map((asset) => (
                    <li key={asset.assetNumber}>
                      {asset.assetNumber}
                      {asset.serialNumber ? ` / ${asset.serialNumber}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <ReturnIntakePanel activeRentalId={id} />
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Handoffs</h2>
        <ol className="mt-4 space-y-3">
          {data.handoffs.map((h) => (
            <li className="border-l-2 pl-4" key={h.id}>
              <strong>{h.type}</strong> ·{' '}
              {new Date(h.handoffAt).toLocaleString()}
              <p className="text-sm text-muted-foreground">
                Recipient: {h.recipientName ?? 'Not recorded'} · Staff:{' '}
                {h.actor.firstName} {h.actor.lastName}
              </p>
              {h.internalNotes ? (
                <p className="mt-1 text-sm">{h.internalNotes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
