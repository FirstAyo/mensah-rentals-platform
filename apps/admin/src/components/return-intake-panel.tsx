'use client';

import type { AdminRentalReturnResponse } from '@mensah-rentals/types';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Intake = Pick<
  AdminRentalReturnResponse,
  'id' | 'activeRentalId' | 'orderNumber' | 'status' | 'version' | 'items'
> & { id?: string; status: AdminRentalReturnResponse['status'] | null };
type Counts = {
  rentable: number;
  damaged: number;
  maintenance: number;
  missing: number;
  externalReceived: number;
  externalMissing: number;
};
const empty: Counts = {
  rentable: 0,
  damaged: 0,
  maintenance: 0,
  missing: 0,
  externalReceived: 0,
  externalMissing: 0,
};

export function ReturnIntakePanel({
  activeRentalId,
}: {
  activeRentalId: string;
}) {
  const [data, setData] = useState<Intake | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetch(`/api/returns/active/${activeRentalId}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Return intake could not be loaded.');
          setData((await response.json()) as Intake);
        })
        .catch((error) =>
          setMessage(
            error instanceof Error
              ? error.message
              : 'Return intake could not be loaded.',
          ),
        ),
    [activeRentalId],
  );
  useEffect(() => void load(), [load]);

  const accounted = useMemo(
    () =>
      Object.values(counts).reduce(
        (total, item) =>
          total +
          item.rentable +
          item.damaged +
          item.maintenance +
          item.missing +
          item.externalReceived +
          item.externalMissing,
        0,
      ) + Object.keys(assets).length,
    [assets, counts],
  );

  async function submit() {
    if (!data || accounted < 1)
      return setMessage('Record at least one returned or missing item.');
    setBusy(true);
    setMessage(null);
    const items = data.items.flatMap((item) => {
      if (item.trackingMode === 'SERIALIZED') {
        const value = counts[item.activeRentalItemId] ?? empty;
        const serializedAssets = item.serializedAssets
          .filter((asset) => assets[asset.activeRentalSerializedAssetId])
          .map((asset) => ({
            activeRentalSerializedAssetId: asset.activeRentalSerializedAssetId,
            disposition: assets[asset.activeRentalSerializedAssetId],
          }));
        if (
          !serializedAssets.length &&
          value.externalReceived === 0 &&
          value.externalMissing === 0
        )
          return [];
        const quantity = (state: string) =>
          serializedAssets.filter((asset) => asset.disposition === state)
            .length;
        return [
          {
            activeRentalItemId: item.activeRentalItemId,
            quantityRentable: quantity('RENTABLE'),
            quantityDamaged: quantity('DAMAGED'),
            quantityMaintenance: quantity('MAINTENANCE'),
            quantityMissing: quantity('MISSING'),
            externalQuantityReceived: value.externalReceived,
            externalQuantityMissing: value.externalMissing,
            serializedAssets,
          },
        ];
      }
      const value = counts[item.activeRentalItemId] ?? empty;
      if (Object.values(value).every((quantity) => quantity === 0)) return [];
      return [
        {
          activeRentalItemId: item.activeRentalItemId,
          quantityRentable: value.rentable,
          quantityDamaged: value.damaged,
          quantityMaintenance: value.maintenance,
          quantityMissing: value.missing,
          externalQuantityReceived: value.externalReceived,
          externalQuantityMissing: value.externalMissing,
          serializedAssets: [],
        },
      ];
    });
    try {
      const response = await fetch(`/api/returns/active/${activeRentalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: data.version,
          receivedAt: new Date().toISOString(),
          internalNotes: notes.trim() || undefined,
          items,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(payload.message ?? 'Return could not be recorded.');
      setCounts({});
      setAssets({});
      setNotes('');
      setMessage(
        'Return recorded. Inventory and reconciliation state were updated atomically.',
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Return could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return <p aria-live="polite">{message ?? 'Loading return intake...'}</p>;
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby="return-intake-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" id="return-intake-heading">
            Return intake
          </h2>
          <p className="text-sm text-muted-foreground">
            Version {data.version} ·{' '}
            {data.status?.replaceAll('_', ' ') ?? 'Not started'}
          </p>
        </div>
        {data.id ? (
          <Link className="underline" href={`/returns/${data.id}`}>
            Open reconciliation
          </Link>
        ) : null}
      </div>
      <p className="rounded-lg bg-muted p-3 text-sm">
        Record physical receipt and confirmed missing quantities separately.
        This action never changes total physical quantity.
      </p>
      <div className="space-y-4">
        {data.items.map((item) => (
          <article
            className="rounded-lg border p-3"
            key={item.activeRentalItemId}
          >
            <h3 className="font-semibold">{item.productName}</h3>
            <p className="text-sm text-muted-foreground">
              Outstanding: {item.outstandingQuantity} {item.rentalUnit} (owned{' '}
              {item.outstandingQuantity - item.externalOutstandingQuantity},
              externally sourced {item.externalOutstandingQuantity})
            </p>
            {item.trackingMode === 'BULK' ? (
              <div className="mt-3 grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
                {(
                  ['rentable', 'damaged', 'maintenance', 'missing'] as const
                ).map((state) => (
                  <label className="text-sm capitalize" key={state}>
                    {state}
                    <input
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                      min="0"
                      max={item.outstandingQuantity}
                      type="number"
                      value={(counts[item.activeRentalItemId] ?? empty)[state]}
                      onChange={(event) =>
                        setCounts((current) => ({
                          ...current,
                          [item.activeRentalItemId]: {
                            ...(current[item.activeRentalItemId] ?? empty),
                            [state]: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {item.serializedAssets
                  .filter((asset) => !asset.accounted)
                  .map((asset) => (
                    <label
                      className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center"
                      key={asset.activeRentalSerializedAssetId}
                    >
                      <span>
                        {asset.assetNumber}
                        {asset.serialNumber ? ` / ${asset.serialNumber}` : ''}
                      </span>
                      <select
                        aria-label={`Condition for ${asset.assetNumber}`}
                        className="rounded-md border bg-background px-3 py-2"
                        value={
                          assets[asset.activeRentalSerializedAssetId] ?? ''
                        }
                        onChange={(event) =>
                          setAssets((current) => ({
                            ...current,
                            [asset.activeRentalSerializedAssetId]:
                              event.target.value,
                          }))
                        }
                      >
                        <option value="">Not in this intake</option>
                        <option value="RENTABLE">Rentable</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="MISSING">Missing</option>
                      </select>
                    </label>
                  ))}
              </div>
            )}
            {item.externalOutstandingQuantity > 0 ? (
              <fieldset className="mt-3 rounded-md border border-dashed p-3">
                <legend className="px-1 text-sm font-medium">
                  Externally sourced equipment
                </legend>
                <p className="mb-2 text-xs text-muted-foreground">
                  These quantities are reconciled operationally and never added
                  to Mensah Rentals inventory.
                </p>
                <div className="grid gap-3 min-[480px]:grid-cols-2">
                  {(['externalReceived', 'externalMissing'] as const).map(
                    (state) => (
                      <label className="text-sm" key={state}>
                        {state === 'externalReceived' ? 'Received' : 'Missing'}
                        <input
                          className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                          min="0"
                          max={item.externalOutstandingQuantity}
                          type="number"
                          value={
                            (counts[item.activeRentalItemId] ?? empty)[state]
                          }
                          onChange={(event) =>
                            setCounts((current) => ({
                              ...current,
                              [item.activeRentalItemId]: {
                                ...(current[item.activeRentalItemId] ?? empty),
                                [state]: Math.max(
                                  0,
                                  Number(event.target.value) || 0,
                                ),
                              },
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            ) : null}
          </article>
        ))}
      </div>
      <label className="block text-sm">
        Internal intake notes
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2"
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {message ? (
        <p aria-live="polite" className="text-sm">
          {message}
        </p>
      ) : null}
      <button
        className="w-full rounded-md bg-primary px-4 py-2.5 text-primary-foreground disabled:opacity-50 sm:w-auto"
        disabled={busy}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? 'Recording return…' : 'Record return intake'}
      </button>
    </section>
  );
}
