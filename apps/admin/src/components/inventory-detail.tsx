'use client';

import type {
  AdminInventoryItemResponse,
  AdminInventoryMetadataResponse,
  AdminInventoryQuantityResponse,
  AdminInventoryTransactionResponse,
  InventoryStateResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

const states: InventoryStateResponse[] = [
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
];
const field = 'w-full rounded-lg border border-border bg-background px-3 py-2';

function DetailBody({
  id,
  canAdjust,
  canViewHistory,
  canViewQuantity,
}: {
  id: string;
  canAdjust: boolean;
  canViewHistory: boolean;
  canViewQuantity: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fromState, setFromState] =
    useState<InventoryStateResponse>('RENTABLE');
  const [toState, setToState] = useState<InventoryStateResponse>('MAINTENANCE');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Manual inventory adjustment');
  const [assetNumber, setAssetNumber] = useState('');
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  function beginNewIntent() {
    setOperationId(crypto.randomUUID());
    setSubmissionComplete(false);
    setError(null);
  }
  const metadata = useQuery<AdminInventoryMetadataResponse>({
    queryKey: ['inventory-detail', id],
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}`);
      if (!response.ok) throw new Error();
      return response.json() as Promise<AdminInventoryMetadataResponse>;
    },
  });
  const quantities = useQuery<AdminInventoryQuantityResponse>({
    queryKey: ['inventory-quantity', id],
    enabled: canViewQuantity,
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}/quantities`);
      if (!response.ok) throw new Error();
      return response.json() as Promise<AdminInventoryQuantityResponse>;
    },
  });
  const items = useQuery<PaginatedResponse<AdminInventoryItemResponse>>({
    queryKey: ['inventory-items', id],
    enabled: canViewQuantity && metadata.data?.trackingMode === 'SERIALIZED',
    queryFn: async () => {
      const response = await fetch(
        `/api/inventory/${id}/items?page=1&pageSize=100`,
      );
      if (!response.ok) throw new Error();
      return response.json() as Promise<
        PaginatedResponse<AdminInventoryItemResponse>
      >;
    },
  });
  const history = useQuery<
    PaginatedResponse<AdminInventoryTransactionResponse>
  >({
    queryKey: ['inventory-history', id],
    enabled: canViewHistory,
    queryFn: async () => {
      const response = await fetch(
        `/api/inventory/${id}/transactions?page=1&pageSize=50`,
      );
      if (!response.ok) throw new Error();
      return response.json() as Promise<
        PaginatedResponse<AdminInventoryTransactionResponse>
      >;
    },
  });
  async function mutate(path: string, body: object) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          operationId,
          reason,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(result?.message ?? 'Inventory update failed.');
        return;
      }
      setOperationId(crypto.randomUUID());
      setSubmissionComplete(true);
      try {
        await Promise.all([
          quantities.refetch(),
          items.refetch(),
          history.refetch(),
        ]);
      } catch {
        setError(
          'The change was recorded, but the page could not refresh. Reload the page; do not submit it again.',
        );
      }
    } catch {
      setError('Inventory update failed. Retry to safely reuse this attempt.');
    } finally {
      setIsSubmitting(false);
    }
  }
  if (metadata.isLoading) return <div>Loading inventory…</div>;
  if (!metadata.data) return <div role="alert">Unable to load inventory.</div>;
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          {metadata.data.trackingMode} inventory
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {metadata.data.product.name}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Operational information on this page is confidential.
        </p>
      </div>
      {canViewQuantity && quantities.data ? (
        <section>
          <h2 className="text-xl font-semibold">Current operational state</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {states.map((state) => (
              <div
                className="rounded-xl border border-border bg-card p-4"
                key={state}
              >
                <p className="text-xs text-muted-foreground">{state}</p>
                <p className="mt-1 text-2xl font-bold">
                  {quantities.data!.states[state]}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {canAdjust && canViewQuantity ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">
            {metadata.data.trackingMode === 'BULK'
              ? 'Move bulk quantity'
              : 'Add serialized asset'}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {metadata.data.trackingMode === 'BULK' ? (
              <>
                <label className="space-y-2">
                  <span>From</span>
                  <select
                    className={field}
                    onChange={(event) => {
                      beginNewIntent();
                      setFromState(
                        event.target.value as InventoryStateResponse,
                      );
                    }}
                    value={fromState}
                  >
                    {states.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span>To</span>
                  <select
                    className={field}
                    onChange={(event) => {
                      beginNewIntent();
                      setToState(event.target.value as InventoryStateResponse);
                    }}
                    value={toState}
                  >
                    {states.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span>Quantity</span>
                  <input
                    className={field}
                    min="1"
                    onChange={(event) => {
                      beginNewIntent();
                      setQuantity(Number(event.target.value));
                    }}
                    type="number"
                    value={quantity}
                  />
                </label>
              </>
            ) : (
              <label className="space-y-2">
                <span>Asset number</span>
                <input
                  className={field}
                  onChange={(event) => {
                    beginNewIntent();
                    setAssetNumber(event.target.value);
                  }}
                  value={assetNumber}
                />
              </label>
            )}
            <label className="space-y-2 md:col-span-2">
              <span>Reason</span>
              <input
                className={field}
                onChange={(event) => {
                  beginNewIntent();
                  setReason(event.target.value);
                }}
                value={reason}
              />
            </label>
            <button
              className="w-fit rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
              disabled={isSubmitting || submissionComplete}
              onClick={() =>
                void mutate(
                  metadata.data!.trackingMode === 'BULK'
                    ? 'bulk-movements'
                    : 'items',
                  metadata.data!.trackingMode === 'BULK'
                    ? { fromState, toState, quantity }
                    : { assetNumber, initialState: 'RENTABLE' },
                )
              }
              type="button"
            >
              {isSubmitting
                ? 'Recordingâ€¦'
                : submissionComplete
                  ? 'Change recorded'
                  : 'Record change'}
            </button>
            {error ? (
              <p className="text-destructive md:col-span-3">{error}</p>
            ) : null}
          </div>
        </section>
      ) : null}
      {items.data ? (
        <section>
          <h2 className="text-xl font-semibold">Serialized assets</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3">Asset</th>
                  <th className="p-3">Serial</th>
                  <th className="p-3">State</th>
                </tr>
              </thead>
              <tbody>
                {items.data.items.map((item) => (
                  <tr className="border-t" key={item.id}>
                    <td className="p-3">{item.assetNumber}</td>
                    <td className="p-3">{item.serialNumber ?? '—'}</td>
                    <td className="p-3">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {history.data ? (
        <section>
          <h2 className="text-xl font-semibold">Append-only history</h2>
          <div className="mt-3 space-y-2">
            {history.data.items.map((item) => (
              <article
                className="rounded-lg border border-border bg-card p-4"
                key={item.id}
              >
                <p className="font-medium">
                  {item.kind}: {item.quantity}{' '}
                  {item.fromState ? `${item.fromState} → ` : ''}
                  {item.toState}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.reason} · {item.actor.firstName} {item.actor.lastName} ·{' '}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function InventoryDetail(props: {
  id: string;
  canAdjust: boolean;
  canViewHistory: boolean;
  canViewQuantity: boolean;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <DetailBody {...props} />
    </QueryClientProvider>
  );
}
