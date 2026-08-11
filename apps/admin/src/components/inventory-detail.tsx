'use client';

import type {
  AdminInventoryItemResponse,
  AdminInventoryLifecycleResponse,
  AdminInventoryMetadataResponse,
  AdminInventoryQuantityResponse,
  AdminInventoryTransactionResponse,
  InventoryStateResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  CirclePlus,
  FilePenLine,
  PackageMinus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AccessibleDialog } from './accessible-dialog';
import { InventoryMaintenanceLinks } from './inventory-maintenance-links';

type Action = 'edit' | 'add' | 'reduce' | 'asset' | 'move' | null;
type LifecycleAction = 'archive' | 'delete' | 'restore';

const safeInitialStates: InventoryStateResponse[] = [
  'RENTABLE',
  'MAINTENANCE',
  'DAMAGED',
];
const physicalStates: InventoryStateResponse[] = [
  'RENTABLE',
  'RENTED',
  'MAINTENANCE',
  'DAMAGED',
  'MISSING',
  'LOST',
  'RETIRED',
];
const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2';
const actionButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function DetailBody({
  id,
  canAdjust,
  canCreateMaintenance,
  canViewMaintenance,
  canViewInspections,
  canViewHistory,
  canViewQuantity,
}: {
  id: string;
  canAdjust: boolean;
  canCreateMaintenance: boolean;
  canViewMaintenance: boolean;
  canViewInspections: boolean;
  canViewHistory: boolean;
  canViewQuantity: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [confirmation, setConfirmation] = useState<LifecycleAction | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [additionType, setAdditionType] = useState<
    'PURCHASE' | 'ACQUISITION' | 'OTHER'
  >('PURCHASE');
  const [reductionType, setReductionType] = useState<
    'SOLD' | 'RETIRED' | 'DISPOSED' | 'INVENTORY_CORRECTION' | 'OTHER'
  >('RETIRED');
  const [assetNumber, setAssetNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [initialState, setInitialState] =
    useState<InventoryStateResponse>('RENTABLE');
  const fromState: InventoryStateResponse = 'RENTABLE';
  const toState: InventoryStateResponse = 'DAMAGED';
  const [internalNotes, setInternalNotes] = useState('');
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  function newIntent() {
    setOperationId(crypto.randomUUID());
    setError(null);
    setNotice(null);
  }

  function openAction(next: Exclude<Action, null>) {
    newIntent();
    setReason('');
    setReference('');
    setQuantity(1);
    setAction(next);
  }

  const metadata = useQuery<AdminInventoryMetadataResponse>({
    queryKey: ['inventory-detail', id],
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load inventory.');
      return response.json() as Promise<AdminInventoryMetadataResponse>;
    },
  });
  const quantities = useQuery<AdminInventoryQuantityResponse>({
    queryKey: ['inventory-quantity', id],
    enabled: canViewQuantity,
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}/quantities`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load quantities.');
      return response.json() as Promise<AdminInventoryQuantityResponse>;
    },
  });
  const lifecycle = useQuery<AdminInventoryLifecycleResponse>({
    queryKey: ['inventory-lifecycle', id],
    enabled: canAdjust,
    queryFn: async () => {
      const response = await fetch(`/api/inventory/${id}/lifecycle`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to check lifecycle safety.');
      return response.json() as Promise<AdminInventoryLifecycleResponse>;
    },
  });
  const items = useQuery<PaginatedResponse<AdminInventoryItemResponse>>({
    queryKey: ['inventory-items', id],
    enabled: canViewQuantity && metadata.data?.trackingMode === 'SERIALIZED',
    queryFn: async () => {
      const response = await fetch(
        `/api/inventory/${id}/items?page=1&pageSize=100`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to load serialized assets.');
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
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Unable to load inventory history.');
      return response.json() as Promise<
        PaginatedResponse<AdminInventoryTransactionResponse>
      >;
    },
  });

  async function refresh() {
    await Promise.all([
      metadata.refetch(),
      quantities.refetch(),
      lifecycle.refetch(),
      items.refetch(),
      history.refetch(),
    ]);
  }

  async function mutate({
    body,
    method = 'POST',
    path = '',
    success,
  }: {
    body: Record<string, unknown>;
    method?: 'POST' | 'PATCH' | 'DELETE';
    path?: string;
    success: string;
  }) {
    if (isSubmitting) return false;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/${id}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, operationId }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setError(
          response.status === 409
            ? (result?.message ??
                'This inventory changed or has an active commitment. Refresh and try again.')
            : (result?.message ?? 'Inventory update failed.'),
        );
        return false;
      }
      setNotice(success);
      setAction(null);
      setConfirmation(null);
      setOperationId(crypto.randomUUID());
      await refresh();
      return true;
    } catch {
      setError('Inventory update failed. Retry to safely reuse this attempt.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitAction() {
    const trimmedReason = reason.trim();
    if (!action || isSubmitting) return;
    if (action !== 'edit' && !trimmedReason) {
      setError('Enter a clear internal reason.');
      return;
    }
    if (
      (action === 'add' || action === 'reduce') &&
      (!Number.isInteger(quantity) || quantity < 1)
    ) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    if (action === 'edit') {
      await mutate({
        body: { internalNotes: internalNotes.trim() || null },
        method: 'PATCH',
        success: 'Inventory notes updated.',
      });
    } else if (action === 'add') {
      await mutate({
        body: {
          quantity,
          reason: trimmedReason,
          reasonType: additionType,
          reference: reference.trim() || null,
        },
        path: '/stock-additions',
        success: `${quantity} unit${quantity === 1 ? '' : 's'} added to rentable stock.`,
      });
    } else if (action === 'reduce') {
      await mutate({
        body: {
          quantity,
          reason: trimmedReason,
          reasonType: reductionType,
          reference: reference.trim() || null,
        },
        path: '/stock-reductions',
        success: `${quantity} unit${quantity === 1 ? '' : 's'} removed from owned stock.`,
      });
    } else if (action === 'asset') {
      if (!assetNumber.trim()) {
        setError('Asset number is required.');
        return;
      }
      await mutate({
        body: {
          assetNumber: assetNumber.trim(),
          serialNumber: serialNumber.trim() || null,
          initialState,
          reason: trimmedReason,
        },
        path: '/items',
        success: `Serialized asset ${assetNumber.trim()} added.`,
      });
    } else {
      await mutate({
        body: { fromState, toState, quantity, reason: trimmedReason },
        path: '/bulk-movements',
        success: 'Physical state movement recorded.',
      });
    }
  }

  async function submitLifecycle() {
    if (!confirmation || !reason.trim()) {
      setError('Enter a clear reason before continuing.');
      return;
    }
    if (confirmation === 'delete') {
      const deleted = await mutate({
        body: { reason: reason.trim() },
        method: 'DELETE',
        success: 'Inventory record permanently deleted.',
      });
      if (deleted) router.replace('/inventory');
      return;
    }
    await mutate({
      body: { reason: reason.trim() },
      path: `/${confirmation}`,
      success:
        confirmation === 'archive'
          ? 'Inventory archived.'
          : 'Inventory restored to active workflows.',
    });
  }

  if (metadata.isLoading)
    return <div className="rounded-xl border p-8">Loading inventory…</div>;
  if (metadata.isError || !metadata.data)
    return (
      <div className="rounded-xl border border-destructive/40 p-5" role="alert">
        Unable to load inventory.{' '}
        <button
          className="font-semibold underline"
          onClick={() => metadata.refetch()}
          type="button"
        >
          Retry
        </button>
      </div>
    );

  const data = metadata.data;
  const currentTotal = quantities.data?.totalQuantity ?? 0;
  const blockers =
    confirmation === 'archive'
      ? lifecycle.data?.archiveBlockers
      : confirmation === 'restore'
        ? lifecycle.data?.restoreBlockers
        : lifecycle.data?.hardDeleteBlockers;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {data.trackingMode} inventory
            </p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                data.isActive
                  ? 'bg-emerald-500/15 text-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {data.isActive ? 'Active' : 'Archived'}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{data.product.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Confidential operational inventory. Product catalogue details are
            edited separately.
          </p>
        </div>
        {canCreateMaintenance && data.isActive ? (
          <a
            className={actionButton}
            href={`/maintenance/work-orders/new?inventoryId=${encodeURIComponent(id)}`}
          >
            Create maintenance work order
          </a>
        ) : null}
      </header>

      <div
        aria-live="polite"
        className="min-h-6 text-sm text-emerald-700 dark:text-emerald-300"
        role="status"
      >
        {notice}
      </div>
      {error ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {canViewQuantity && quantities.data ? (
        <section aria-labelledby="physical-heading">
          <h2 className="text-xl font-semibold" id="physical-heading">
            Physical inventory
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reservations are commitments and are not included as a physical
            state.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">Total physical</p>
              <p className="mt-1 text-2xl font-bold">{currentTotal}</p>
            </div>
            {physicalStates.map((state) => (
              <div
                className="rounded-xl border border-border bg-card p-4"
                key={state}
              >
                <p className="text-xs text-muted-foreground">
                  {readable(state)}
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {quantities.data!.states[state] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canViewQuantity && quantities.data ? (
        <section
          aria-labelledby="commitments-heading"
          className="rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <h2 className="text-xl font-semibold" id="commitments-heading">
            Reservation commitments
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Commitments are operational allocations, not additional physical
            stock, and are shown separately from the state totals above.
          </p>
          <div className="mt-3 max-w-xs rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Currently reserved</p>
            <p className="mt-1 text-2xl font-bold">
              {quantities.data.reservedCommitmentQuantity}
            </p>
          </div>
        </section>
      ) : null}

      {canAdjust ? (
        <section
          className="rounded-xl border border-border bg-card p-4 sm:p-5"
          aria-labelledby="actions-heading"
        >
          <h2 className="text-xl font-semibold" id="actions-heading">
            Inventory actions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quantity changes are recorded as immutable stock operations, never
            direct edits.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              className={actionButton}
              onClick={() => {
                setInternalNotes(data.internalNotes ?? '');
                openAction('edit');
              }}
              type="button"
            >
              <FilePenLine className="h-4 w-4" aria-hidden="true" /> Edit
              inventory
            </button>
            {data.isActive && data.trackingMode === 'BULK' ? (
              <>
                <button
                  className={actionButton}
                  onClick={() => openAction('add')}
                  type="button"
                >
                  <CirclePlus className="h-4 w-4" aria-hidden="true" /> Add
                  stock
                </button>
                <button
                  className={actionButton}
                  onClick={() => openAction('reduce')}
                  type="button"
                >
                  <PackageMinus className="h-4 w-4" aria-hidden="true" /> Reduce
                  / retire stock
                </button>
                <button
                  className={actionButton}
                  onClick={() => openAction('move')}
                  type="button"
                >
                  Mark rentable stock damaged
                </button>
              </>
            ) : null}
            {data.isActive && data.trackingMode === 'SERIALIZED' ? (
              <button
                className={actionButton}
                onClick={() => openAction('asset')}
                type="button"
              >
                <CirclePlus className="h-4 w-4" aria-hidden="true" /> Add
                serialized asset
              </button>
            ) : null}
            {data.isActive ? (
              <button
                className={actionButton}
                disabled={!lifecycle.data?.canArchive}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  newIntent();
                  setReason('');
                  setConfirmation('archive');
                }}
                title={lifecycle.data?.archiveBlockers.join(' ') || undefined}
                type="button"
              >
                <Archive className="h-4 w-4" aria-hidden="true" /> Archive
                inventory
              </button>
            ) : (
              <button
                className={actionButton}
                disabled={!lifecycle.data?.canRestore}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  newIntent();
                  setReason('');
                  setConfirmation('restore');
                }}
                type="button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore
                inventory
              </button>
            )}
            {data.isActive && lifecycle.data?.canHardDelete ? (
              <button
                className={`${actionButton} border-destructive/50 text-destructive hover:bg-destructive/10`}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  newIntent();
                  setReason('');
                  setConfirmation('delete');
                }}
                type="button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                inventory
              </button>
            ) : null}
          </div>
          {lifecycle.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Checking lifecycle safety…
            </p>
          ) : null}
          {lifecycle.isError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              Lifecycle actions are unavailable until the safety check succeeds.
            </p>
          ) : null}
          {data.isActive &&
          lifecycle.data &&
          !lifecycle.data.canArchive &&
          lifecycle.data.archiveBlockers.length ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold">Inventory cannot be archived yet</p>
              <ul className="mt-1 list-disc pl-5">
                {lifecycle.data.archiveBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {action ? (
        <section
          className="rounded-xl border border-border bg-card p-4 sm:p-5"
          aria-labelledby="inventory-form-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold" id="inventory-form-heading">
                {action === 'edit'
                  ? 'Edit inventory'
                  : action === 'add'
                    ? 'Add stock'
                    : action === 'reduce'
                      ? 'Reduce / retire stock'
                      : action === 'asset'
                        ? 'Add serialized asset'
                        : 'Mark rentable stock damaged'}
              </h2>
              {action === 'edit' ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Product association, tracking mode, and quantities are
                  intentionally read-only.
                </p>
              ) : null}
            </div>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={isSubmitting}
              onClick={() => {
                setAction(null);
                setError(null);
              }}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {action === 'edit' ? (
              <label className="space-y-2 md:col-span-2 xl:col-span-3">
                <span>Internal operational notes</span>
                <textarea
                  className={field}
                  maxLength={2000}
                  onChange={(event) => {
                    newIntent();
                    setInternalNotes(event.target.value);
                  }}
                  rows={4}
                  value={internalNotes}
                />
              </label>
            ) : null}
            {action === 'add' || action === 'reduce' || action === 'move' ? (
              <label className="space-y-2">
                <span>Quantity</span>
                <input
                  className={field}
                  max="1000000"
                  min="1"
                  onChange={(event) => {
                    newIntent();
                    setQuantity(Number(event.target.value));
                  }}
                  required
                  step="1"
                  type="number"
                  value={quantity}
                />
              </label>
            ) : null}
            {action === 'add' ? (
              <>
                <label className="space-y-2">
                  <span>Acquisition type</span>
                  <select
                    className={field}
                    onChange={(event) => {
                      newIntent();
                      setAdditionType(
                        event.target.value as typeof additionType,
                      );
                    }}
                    value={additionType}
                  >
                    <option value="PURCHASE">Purchase</option>
                    <option value="ACQUISITION">Acquisition</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p>
                    Current physical quantity: <strong>{currentTotal}</strong>
                  </p>
                  <p>
                    Resulting quantity:{' '}
                    <strong>
                      {currentTotal +
                        (Number.isFinite(quantity) ? quantity : 0)}
                    </strong>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    New stock enters the rentable state.
                  </p>
                </div>
              </>
            ) : null}
            {action === 'reduce' ? (
              <>
                <label className="space-y-2">
                  <span>Reason type</span>
                  <select
                    className={field}
                    onChange={(event) => {
                      newIntent();
                      setReductionType(
                        event.target.value as typeof reductionType,
                      );
                    }}
                    value={reductionType}
                  >
                    <option value="SOLD">Sold</option>
                    <option value="RETIRED">Retired</option>
                    <option value="DISPOSED">Disposed</option>
                    <option value="INVENTORY_CORRECTION">
                      Inventory correction
                    </option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p>
                    Current physical quantity: <strong>{currentTotal}</strong>
                  </p>
                  <p>
                    Proposed quantity:{' '}
                    <strong>
                      {Math.max(
                        0,
                        currentTotal -
                          (Number.isFinite(quantity) ? quantity : 0),
                      )}
                    </strong>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Only uncommitted rentable units may be removed.
                  </p>
                </div>
              </>
            ) : null}
            {action === 'asset' ? (
              <>
                <label className="space-y-2">
                  <span>Asset number</span>
                  <input
                    className={field}
                    maxLength={100}
                    onChange={(event) => {
                      newIntent();
                      setAssetNumber(event.target.value);
                    }}
                    required
                    value={assetNumber}
                  />
                </label>
                <label className="space-y-2">
                  <span>Serial number (optional)</span>
                  <input
                    className={field}
                    maxLength={100}
                    onChange={(event) => {
                      newIntent();
                      setSerialNumber(event.target.value);
                    }}
                    value={serialNumber}
                  />
                </label>
                <label className="space-y-2">
                  <span>Initial physical state</span>
                  <select
                    className={field}
                    onChange={(event) => {
                      newIntent();
                      setInitialState(
                        event.target.value as InventoryStateResponse,
                      );
                    }}
                    value={initialState}
                  >
                    {safeInitialStates.map((state) => (
                      <option key={state} value={state}>
                        {readable(state)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {action === 'move' ? (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground md:col-span-2">
                This action only records rentable units as damaged. Checkout,
                return, maintenance, missing, lost, and retirement changes must
                use their dedicated workflows.
              </p>
            ) : null}
            {action !== 'edit' ? (
              <label className="space-y-2 md:col-span-2">
                <span>Internal reason</span>
                <textarea
                  className={field}
                  maxLength={500}
                  onChange={(event) => {
                    newIntent();
                    setReason(event.target.value);
                  }}
                  required
                  rows={3}
                  value={reason}
                />
              </label>
            ) : null}
            {action === 'add' || action === 'reduce' ? (
              <label className="space-y-2">
                <span>Reference (optional)</span>
                <input
                  className={field}
                  maxLength={160}
                  onChange={(event) => {
                    newIntent();
                    setReference(event.target.value);
                  }}
                  placeholder="Supplier invoice or stock-count reference"
                  value={reference}
                />
              </label>
            ) : null}
          </div>
          <button
            className="mt-4 min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => void submitAction()}
            type="button"
          >
            {isSubmitting
              ? 'Recording…'
              : action === 'add'
                ? `Add ${quantity || 0} unit${quantity === 1 ? '' : 's'}`
                : action === 'reduce'
                  ? `Remove ${quantity || 0} unit${quantity === 1 ? '' : 's'}`
                  : action === 'asset'
                    ? 'Add serialized asset'
                    : action === 'edit'
                      ? 'Save inventory'
                      : 'Record state movement'}
          </button>
        </section>
      ) : null}

      {items.data ? (
        <section>
          <h2 className="text-xl font-semibold">Serialized assets</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left">
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
                    <td className="p-3">{readable(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <InventoryMaintenanceLinks
        canViewInspections={canViewInspections}
        canViewMaintenance={canViewMaintenance}
        inventoryId={id}
      />

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
                  {readable(item.kind)}: {item.quantity}{' '}
                  {item.fromState ? `${readable(item.fromState)} → ` : ''}
                  {item.toState ? readable(item.toState) : ''}
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

      <AccessibleDialog
        descriptionId="inventory-lifecycle-description"
        initialFocusRef={cancelRef}
        onClose={() => {
          if (!isSubmitting) setConfirmation(null);
        }}
        open={Boolean(confirmation)}
        returnFocusRef={triggerRef}
        titleId="inventory-lifecycle-title"
      >
        {confirmation ? (
          <div className="space-y-4 p-5 sm:p-6">
            <h2
              className="text-xl font-semibold"
              id="inventory-lifecycle-title"
            >
              {confirmation === 'delete'
                ? 'Delete inventory?'
                : confirmation === 'archive'
                  ? 'Archive inventory?'
                  : 'Restore inventory?'}
            </h2>
            <div
              className="space-y-2 text-sm text-muted-foreground"
              id="inventory-lifecycle-description"
            >
              {confirmation === 'delete' ? (
                <>
                  <p>
                    You are about to permanently delete the unused inventory
                    record for{' '}
                    <strong className="text-foreground">
                      {data.product.name}
                    </strong>
                    .
                  </p>
                  <p>
                    This record has no stock or historical activity. This action
                    cannot be undone.
                  </p>
                </>
              ) : confirmation === 'archive' ? (
                <>
                  <p>
                    The inventory remains available to history, reports,
                    maintenance, and audit records.
                  </p>
                  <p>
                    It will be hidden from normal active workflows and cannot be
                    used for new reservations.
                  </p>
                </>
              ) : (
                <p>
                  This inventory will become available to new operational
                  workflows again.
                </p>
              )}
              {blockers?.length ? (
                <ul className="list-disc pl-5">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <label className="block space-y-2">
              <span>Internal reason</span>
              <textarea
                className={field}
                maxLength={500}
                onChange={(event) => {
                  newIntent();
                  setReason(event.target.value);
                }}
                required
                rows={3}
                value={reason}
              />
            </label>
            {error ? (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
                disabled={isSubmitting}
                onClick={() => setConfirmation(null)}
                ref={cancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`min-h-11 rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${confirmation === 'delete' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}
                disabled={isSubmitting || Boolean(blockers?.length)}
                onClick={() => void submitLifecycle()}
                type="button"
              >
                {isSubmitting
                  ? 'Working…'
                  : confirmation === 'delete'
                    ? 'Yes, delete inventory'
                    : confirmation === 'archive'
                      ? 'Archive inventory'
                      : 'Restore inventory'}
              </button>
            </div>
          </div>
        ) : null}
      </AccessibleDialog>
    </div>
  );
}

export function InventoryDetail(props: {
  id: string;
  canAdjust: boolean;
  canCreateMaintenance: boolean;
  canViewMaintenance: boolean;
  canViewInspections: boolean;
  canViewHistory: boolean;
  canViewQuantity: boolean;
}) {
  return <DetailBody {...props} />;
}
