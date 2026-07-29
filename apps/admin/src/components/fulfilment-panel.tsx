'use client';

import type { AdminFulfilmentResponse } from '@mensah-rentals/types';
import { FileDown, PackageCheck, Play, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Permissions = {
  canView: boolean;
  canPrepare: boolean;
  canCheckout: boolean;
  canPartialCheckout: boolean;
  canHandoff: boolean;
  canPdf: boolean;
};

export function FulfilmentPanel({
  orderId,
  orderReservationVersion,
  permissions,
}: {
  orderId: string;
  orderReservationVersion: number;
  permissions: Permissions;
}) {
  const [data, setData] = useState<AdminFulfilmentResponse | null>(null);
  const [notStarted, setNotStarted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Record<string, number>>({});
  const [preparedAssets, setPreparedAssets] = useState<Record<string, boolean>>(
    {},
  );
  const [checkout, setCheckout] = useState<Record<string, number>>({});
  const [partial, setPartial] = useState(false);
  const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState('');

  const load = useCallback(async () => {
    if (!permissions.canView) return;
    const response = await fetch(`/api/orders/${orderId}/fulfilment`, {
      cache: 'no-store',
    });
    if (response.status === 404) {
      setNotStarted(true);
      setData(null);
      return;
    }
    if (!response.ok) throw new Error('Fulfilment could not be loaded.');
    const next = (await response.json()) as AdminFulfilmentResponse;
    setData(next);
    setNotStarted(false);
    setPrepared(
      Object.fromEntries(
        next.items.map((item) => [
          item.rentalOrderItemId,
          item.preparedQuantity,
        ]),
      ),
    );
    setPreparedAssets(
      Object.fromEntries(
        next.items.flatMap((item) =>
          item.serializedAllocations.map((asset) => [
            asset.allocationId,
            asset.prepared,
          ]),
        ),
      ),
    );
    setCheckout(
      Object.fromEntries(
        next.items.map((item) => [
          item.rentalOrderItemId,
          Math.min(item.preparedQuantity, item.reservedQuantity),
        ]),
      ),
    );
  }, [orderId, permissions.canView]);
  useEffect(() => {
    void load().catch((caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : 'Fulfilment could not be loaded.',
      ),
    );
  }, [load]);

  async function mutate(
    path: string,
    method: 'POST' | 'PUT',
    body: Record<string, unknown>,
  ) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/orders/${orderId}/fulfilment/${path}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: crypto.randomUUID(), ...body }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This fulfilment changed. Refresh and review it before trying again.'
            : response.status === 422
              ? 'The requested quantities or lifecycle transition are invalid.'
              : 'Fulfilment could not be updated.',
        );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Fulfilment could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!permissions.canView) return null;
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-labelledby="fulfilment-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" id="fulfilment-heading">
            Fulfilment and checkout
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal preparation, physical handoff, and active-rental controls.
          </p>
        </div>
        {data ? (
          <span className="rounded-full border px-3 py-1 text-sm font-semibold">
            {data.status.replaceAll('_', ' ')}
          </span>
        ) : null}
      </div>
      {error ? (
        <p
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notStarted ? (
        <div className="mt-5 rounded-lg border border-dashed p-5">
          <p>No preparation record exists yet.</p>
          {permissions.canPrepare ? (
            <button
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() =>
                void mutate('start-preparation', 'POST', {
                  expectedReservationVersion: orderReservationVersion,
                })
              }
              type="button"
            >
              <Play className="h-4 w-4" aria-hidden="true" /> Start preparation
            </button>
          ) : null}
        </div>
      ) : null}
      {data ? (
        <>
          <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
            {data.notice}
          </p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.items.map((item) => (
              <article className="rounded-lg border p-4" key={item.id}>
                <h3 className="font-semibold">{item.productName}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt>Ordered</dt>
                  <dd className="text-right font-medium">
                    {item.orderedQuantity}
                  </dd>
                  <dt>Reserved remaining</dt>
                  <dd className="text-right font-medium">
                    {item.reservedQuantity}
                  </dd>
                  <dt>Prepared</dt>
                  <dd
                    aria-label="Prepared quantity"
                    className="text-right font-medium"
                  >
                    {item.preparedQuantity}
                  </dd>
                  <dt>Checked out</dt>
                  <dd className="text-right font-medium">
                    {item.checkedOutQuantity}
                  </dd>
                  <dt>Commercial remaining</dt>
                  <dd className="text-right font-medium">
                    {item.remainingCommercialQuantity}
                  </dd>
                  <dt>Reservation shortfall</dt>
                  <dd className="text-right font-medium">
                    {item.shortfallQuantity}
                  </dd>
                </dl>
                {permissions.canPrepare &&
                data.status !== 'CHECKED_OUT' &&
                item.trackingMode !== 'SERIALIZED' ? (
                  <label className="mt-4 block text-sm font-medium">
                    Prepared total
                    <input
                      className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
                      min={0}
                      max={item.reservedQuantity}
                      onChange={(event) =>
                        setPrepared((current) => ({
                          ...current,
                          [item.rentalOrderItemId]: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={prepared[item.rentalOrderItemId] ?? 0}
                    />
                  </label>
                ) : null}
                {item.trackingMode === 'SERIALIZED' &&
                item.serializedAllocations.length ? (
                  <fieldset className="mt-4 rounded-lg border p-3">
                    <legend className="px-1 text-sm font-medium">
                      Prepared serialized assets
                    </legend>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Select the exact reserved assets physically prepared for
                      this order.
                    </p>
                    <ul className="space-y-2 text-sm">
                      {item.serializedAllocations.map((asset) => (
                        <li key={asset.allocationId}>
                          <label className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
                            <input
                              checked={
                                preparedAssets[asset.allocationId] ?? false
                              }
                              disabled={
                                pending ||
                                !permissions.canPrepare ||
                                data.status === 'CHECKED_OUT' ||
                                asset.status !== 'ACTIVE'
                              }
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setPreparedAssets((current) => {
                                  const next = {
                                    ...current,
                                    [asset.allocationId]: checked,
                                  };
                                  setPrepared((quantities) => ({
                                    ...quantities,
                                    [item.rentalOrderItemId]:
                                      item.serializedAllocations.filter(
                                        (candidate) =>
                                          candidate.status === 'ACTIVE' &&
                                          (next[candidate.allocationId] ??
                                            false),
                                      ).length,
                                  }));
                                  return next;
                                });
                              }}
                              type="checkbox"
                            />
                            <span>
                              {asset.assetNumber}
                              {asset.serialNumber
                                ? ` / ${asset.serialNumber}`
                                : ''}{' '}
                              · {asset.status}
                              {asset.prepared ? ' · PREPARED' : ''}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ) : null}
                {item.serializedAllocations.length ? (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {item.serializedAllocations.map((asset) => (
                      <li key={asset.allocationId}>
                        {asset.assetNumber}
                        {asset.serialNumber
                          ? ` / ${asset.serialNumber}`
                          : ''} · {asset.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {permissions.canCheckout &&
                permissions.canHandoff &&
                data.status !== 'CHECKED_OUT' ? (
                  <label className="mt-4 block text-sm font-medium">
                    Checkout now
                    <input
                      className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
                      min={0}
                      max={Math.min(
                        item.preparedQuantity,
                        item.reservedQuantity,
                      )}
                      onChange={(event) =>
                        setCheckout((current) => ({
                          ...current,
                          [item.rentalOrderItemId]: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={checkout[item.rentalOrderItemId] ?? 0}
                    />
                  </label>
                ) : null}
              </article>
            ))}
          </div>
          {permissions.canPrepare && data.status !== 'CHECKED_OUT' ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  void mutate('preparation', 'PUT', {
                    expectedVersion: data.version,
                    items: data.items.map((item) => ({
                      rentalOrderItemId: item.rentalOrderItemId,
                      quantity: prepared[item.rentalOrderItemId] ?? 0,
                      serializedAllocationIds:
                        item.trackingMode === 'SERIALIZED'
                          ? item.serializedAllocations
                              .filter(
                                (asset) =>
                                  asset.status === 'ACTIVE' &&
                                  (preparedAssets[asset.allocationId] ?? false),
                              )
                              .map((asset) => asset.allocationId)
                          : [],
                    })),
                  })
                }
                type="button"
              >
                Save preparation
              </button>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  void mutate('mark-ready', 'POST', {
                    expectedVersion: data.version,
                  })
                }
                type="button"
              >
                <PackageCheck className="h-4 w-4" aria-hidden="true" /> Mark
                ready
              </button>
            </div>
          ) : null}
          {permissions.canCheckout &&
          permissions.canHandoff &&
          (data.status === 'READY' ||
            data.status === 'PARTIALLY_CHECKED_OUT') ? (
            <fieldset className="mt-6 rounded-lg border p-4">
              <legend className="px-2 font-semibold">
                Confirm physical handoff and checkout
              </legend>
              <label className="mt-2 block text-sm font-medium">
                Recipient name
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
                  maxLength={200}
                  onChange={(event) => setRecipient(event.target.value)}
                  value={recipient}
                />
              </label>
              {permissions.canPartialCheckout ? (
                <label className="mt-3 flex min-h-11 items-center gap-3">
                  <input
                    checked={partial}
                    onChange={(event) => setPartial(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  This is an intentional partial checkout
                </label>
              ) : null}
              {partial ? (
                <label className="mt-2 block text-sm font-medium">
                  Internal partial-checkout reason
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border bg-background p-3"
                    maxLength={2000}
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </label>
              ) : null}
              <button
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={
                  pending || !recipient.trim() || (partial && !reason.trim())
                }
                onClick={() =>
                  void mutate('checkout', 'POST', {
                    allowPartial: partial,
                    expectedReservationVersion: data.reservationVersion,
                    expectedVersion: data.version,
                    handoffAt: new Date().toISOString(),
                    internalReason: partial ? reason : undefined,
                    items: data.items
                      .filter(
                        (item) => (checkout[item.rentalOrderItemId] ?? 0) > 0,
                      )
                      .map((item) => ({
                        rentalOrderItemId: item.rentalOrderItemId,
                        quantity: checkout[item.rentalOrderItemId],
                        serializedAllocationIds:
                          item.trackingMode === 'SERIALIZED'
                            ? item.serializedAllocations
                                .filter(
                                  (asset) =>
                                    asset.status === 'ACTIVE' && asset.prepared,
                                )
                                .slice(0, checkout[item.rentalOrderItemId] ?? 0)
                                .map((asset) => asset.allocationId)
                            : [],
                      })),
                    recipientName: recipient,
                  })
                }
                type="button"
              >
                <Truck className="h-4 w-4" aria-hidden="true" /> Confirm{' '}
                {data.fulfilmentMethod === 'PICKUP' ? 'pickup' : 'delivery'} and
                check out
              </button>
            </fieldset>
          ) : null}
          {permissions.canPdf ? (
            <div className="mt-5 flex flex-wrap gap-3">
              {[
                ['picking-pdf', 'Picking list'],
                ['handoff-pdf', 'Handoff manifest'],
                ['active-rental-pdf', 'Active rental summary'],
              ].map(([path, label]) => (
                <a
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"
                  href={`/api/orders/${orderId}/fulfilment/${path}`}
                  key={path}
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" /> {label}
                </a>
              ))}
            </div>
          ) : null}
          <ol className="mt-5 space-y-2 border-t pt-4">
            {data.activities.map((activity) => (
              <li className="text-sm" key={activity.id}>
                <strong>{activity.type.replaceAll('_', ' ')}</strong> ·{' '}
                {new Date(activity.createdAt).toLocaleString()} ·{' '}
                {activity.actor.firstName} {activity.actor.lastName}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
