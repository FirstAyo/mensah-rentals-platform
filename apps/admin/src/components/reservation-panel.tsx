'use client';

import type {
  AdminEligibleAssetsResponse,
  AdminInventoryReservationResponse,
  AdminOrderAvailabilityResponse,
} from '@mensah-rentals/types';
import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateWorkSummary } from '@/lib/work-summary';

interface ReservationPermissions {
  canComplete: boolean;
  canCreate: boolean;
  canOverride: boolean;
  canRelease: boolean;
  canViewAvailability: boolean;
  canViewReservation: boolean;
}

type Confirmation =
  | { action: 'complete' | 'create-full' | 'create-partial' }
  | { action: 'release-all' | 'release-selected' };

const statusStyles: Record<string, string> = {
  RESERVATION_FAILED: 'bg-destructive/10 text-destructive',
  PARTIALLY_RESERVED: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  RELEASED: 'bg-muted text-muted-foreground',
  RESERVED: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
};

function friendlyError(status: number) {
  if (status === 409)
    return 'Reservation data changed while this page was open. Refresh and review the latest values.';
  if (status === 422)
    return 'The reservation could not be applied to this order. Review quantities, dates, and selected assets.';
  if (status === 403)
    return 'Your current permissions do not allow this reservation action.';
  return 'The reservation action could not be completed.';
}

export function ReservationPanel({
  orderId,
  permissions,
}: {
  orderId: string;
  permissions: ReservationPermissions;
}) {
  const [availability, setAvailability] =
    useState<AdminOrderAvailabilityResponse | null>(null);
  const [reservation, setReservation] =
    useState<AdminInventoryReservationResponse | null>(null);
  const [eligible, setEligible] = useState<
    Record<string, AdminEligibleAssetsResponse['items']>
  >({});
  const [selectedAssets, setSelectedAssets] = useState<
    Record<string, string[]>
  >({});
  const [releaseAssets, setReleaseAssets] = useState<Record<string, string[]>>(
    {},
  );
  const [releaseQuantities, setReleaseQuantities] = useState<
    Record<string, number>
  >({});
  const [overrideReason, setOverrideReason] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reservationResponse, availabilityResponse] = await Promise.all([
        permissions.canViewReservation
          ? fetch(`/api/orders/${orderId}/reservation`, {
              cache: 'no-store',
            })
          : null,
        permissions.canViewAvailability
          ? fetch(`/api/orders/${orderId}/availability`, {
              cache: 'no-store',
            })
          : null,
      ]);
      if (reservationResponse) {
        if (reservationResponse.ok)
          setReservation(
            (await reservationResponse.json()) as AdminInventoryReservationResponse,
          );
        else if (reservationResponse.status === 404) setReservation(null);
        else throw new Error('Reservation details could not be loaded.');
      }
      if (availabilityResponse) {
        if (!availabilityResponse.ok)
          throw new Error('Internal availability could not be loaded.');
        setAvailability(
          (await availabilityResponse.json()) as AdminOrderAvailabilityResponse,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Reservation details could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    orderId,
    permissions.canViewAvailability,
    permissions.canViewReservation,
  ]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (confirmation) confirmButtonRef.current?.focus();
  }, [confirmation]);

  async function loadEligibleAssets(rentalOrderItemId: string) {
    setError(null);
    const response = await fetch(
      reservation
        ? `/api/orders/${orderId}/reservations/${reservation.id}/eligible-assets?rentalOrderItemId=${encodeURIComponent(rentalOrderItemId)}`
        : `/api/orders/${orderId}/eligible-assets?rentalOrderItemId=${encodeURIComponent(rentalOrderItemId)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      setError('Eligible serialized assets could not be loaded.');
      return;
    }
    const body = (await response.json()) as AdminEligibleAssetsResponse;
    setEligible((current) => ({ ...current, [rentalOrderItemId]: body.items }));
  }

  function serializedSelections() {
    return Object.entries(selectedAssets)
      .filter(([, ids]) => ids.length)
      .map(([rentalOrderItemId, serializedAssetIds]) => ({
        rentalOrderItemId,
        serializedAssetIds,
      }));
  }

  async function mutate(action: Confirmation['action']) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      let url = `/api/orders/${orderId}/reservations`;
      let body: Record<string, unknown> = { operationId: crypto.randomUUID() };
      if (action === 'create-full' || action === 'create-partial') {
        body = {
          ...body,
          allowPartial: action === 'create-partial',
          ...(action === 'create-partial' &&
          permissions.canOverride &&
          overrideReason.trim()
            ? { overrideReason: overrideReason.trim() }
            : {}),
          serializedSelections: serializedSelections(),
        };
      } else if (action === 'complete' && reservation) {
        url += `/${reservation.id}/complete`;
        body = {
          ...body,
          allowPartial: false,
          expectedVersion: reservation.version,
          serializedSelections: serializedSelections(),
        };
      } else if (reservation) {
        url += `/${reservation.id}/release`;
        const items = reservation.items
          .map((item) => ({
            allocationIds: releaseAssets[item.rentalOrderItemId] ?? [],
            rentalOrderItemId: item.rentalOrderItemId,
            ...(releaseQuantities[item.rentalOrderItemId]
              ? { quantity: releaseQuantities[item.rentalOrderItemId] }
              : {}),
          }))
          .filter((item) => item.allocationIds.length || item.quantity);
        body = {
          ...body,
          expectedVersion: reservation.version,
          reason: releaseReason.trim(),
          ...(action === 'release-selected' ? { items } : {}),
        };
      }
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error(friendlyError(response.status));
      setConfirmation(null);
      setOverrideReason('');
      setReleaseReason('');
      setReleaseAssets({});
      setReleaseQuantities({});
      setSelectedAssets({});
      invalidateWorkSummary();
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The reservation action could not be completed.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!permissions.canViewReservation && !permissions.canViewAvailability)
    return null;

  const shortfall =
    reservation?.items.reduce((sum, item) => sum + item.shortfallQuantity, 0) ??
    availability?.items.reduce(
      (sum, item) => sum + item.shortfallQuantity,
      0,
    ) ??
    0;
  const serializedFullSelectionIncomplete = Boolean(
    availability?.items.some(
      (item) =>
        item.trackingMode === 'SERIALIZED' &&
        (selectedAssets[item.rentalOrderItemId]?.length ?? 0) !==
          item.orderedQuantity,
    ),
  );
  const serializedPartialSelectionIncomplete = Boolean(
    availability?.items.some(
      (item) =>
        item.trackingMode === 'SERIALIZED' &&
        (selectedAssets[item.rentalOrderItemId]?.length ?? 0) <
          Math.min(item.orderedQuantity, item.availableToReserve),
    ),
  );
  const hasReleaseSelection =
    Object.values(releaseQuantities).some((quantity) => quantity > 0) ||
    Object.values(releaseAssets).some((ids) => ids.length > 0);

  return (
    <section
      aria-labelledby="reservation-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Staff-only inventory commitment
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="reservation-heading">
            Reservation
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Reservations commit internal inventory for the order dates. They do
            not check equipment out, change the commercial order, or expose
            inventory information to customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${statusStyles[reservation?.status ?? ''] ?? 'bg-muted'}`}
          >
            {reservation?.status.replaceAll('_', ' ') ?? 'NOT RESERVED'}
          </span>
          <button
            aria-label="Refresh reservation and availability"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border disabled:opacity-50"
            disabled={loading || pending}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <div
          className="mt-5 space-y-3"
          role="status"
          aria-label="Loading reservation"
        >
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Ordered"
              value={availability?.items.reduce(
                (sum, item) => sum + item.orderedQuantity,
                0,
              )}
            />
            <Metric
              label="Reserved"
              value={
                reservation?.items.reduce(
                  (sum, item) => sum + item.reservedQuantity,
                  0,
                ) ?? 0
              }
            />
            <Metric
              label="Shortfall"
              value={shortfall}
              warning={shortfall > 0}
            />
            <Metric
              label="Available for dates"
              value={availability?.items.reduce(
                (sum, item) => sum + item.availableToReserve,
                0,
              )}
              privateValue
            />
          </div>

          {availability ? (
            <div
              aria-label="Reservation quantities table"
              className="mt-5 overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">
                  Internal order-item availability and reservation quantities
                </caption>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Equipment</th>
                    <th className="px-3 py-3">Tracking</th>
                    <th className="px-3 py-3 text-right">Ordered</th>
                    <th className="px-3 py-3 text-right">Reserved</th>
                    <th className="px-3 py-3 text-right">Shortfall</th>
                    <th className="px-3 py-3 text-right">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {availability.items.map((item) => {
                    const current = reservation?.items.find(
                      (entry) =>
                        entry.rentalOrderItemId === item.rentalOrderItemId,
                    );
                    return (
                      <tr
                        className="border-b last:border-0"
                        key={item.rentalOrderItemId}
                      >
                        <td className="px-3 py-4 font-medium">
                          {item.productName}
                        </td>
                        <td className="px-3 py-4">
                          {item.trackingMode ?? 'No inventory record'}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums">
                          {item.orderedQuantity}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums">
                          {current?.reservedQuantity ?? 0}
                        </td>
                        <td className="px-3 py-4 text-right tabular-nums">
                          {current?.shortfallQuantity ?? item.shortfallQuantity}
                        </td>
                        <td className="px-3 py-4 text-right font-semibold tabular-nums">
                          {item.availableToReserve}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {reservation ? (
            <ReservationAssets
              eligible={eligible}
              loadEligibleAssets={loadEligibleAssets}
              releaseAssets={releaseAssets}
              releaseQuantities={releaseQuantities}
              reservation={reservation}
              selectedAssets={selectedAssets}
              setReleaseAssets={setReleaseAssets}
              setReleaseQuantities={setReleaseQuantities}
              setSelectedAssets={setSelectedAssets}
            />
          ) : null}
          {!reservation && availability ? (
            <InitialSerializedAssets
              availability={availability}
              eligible={eligible}
              loadEligibleAssets={loadEligibleAssets}
              selectedAssets={selectedAssets}
              setSelectedAssets={setSelectedAssets}
            />
          ) : null}

          {permissions.canCreate ||
          permissions.canComplete ||
          permissions.canRelease ? (
            <div className="mt-5 space-y-4 rounded-lg border bg-muted/30 p-4">
              {permissions.canOverride ? (
                <label className="block text-sm font-medium">
                  Override/shortfall reason (required only when applying an
                  override)
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3"
                    maxLength={500}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    value={overrideReason}
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {!reservation && permissions.canCreate ? (
                  <>
                    <ActionButton
                      disabled={serializedFullSelectionIncomplete}
                      icon={PackageCheck}
                      label="Reserve in full"
                      onClick={() => setConfirmation({ action: 'create-full' })}
                      pending={pending}
                      primary
                    />
                    {permissions.canOverride ? (
                      <ActionButton
                        disabled={
                          !overrideReason.trim() ||
                          serializedPartialSelectionIncomplete
                        }
                        icon={AlertTriangle}
                        label="Confirm partial reservation"
                        onClick={() =>
                          setConfirmation({ action: 'create-partial' })
                        }
                        pending={pending}
                      />
                    ) : null}
                  </>
                ) : null}
                {(reservation?.status === 'PARTIALLY_RESERVED' ||
                  reservation?.status === 'RESERVATION_FAILED') &&
                permissions.canComplete ? (
                  <ActionButton
                    icon={CheckCircle2}
                    label={
                      reservation.status === 'RESERVATION_FAILED'
                        ? 'Retry reservation'
                        : 'Complete shortfall'
                    }
                    onClick={() => setConfirmation({ action: 'complete' })}
                    pending={pending}
                    primary
                  />
                ) : null}
              </div>
              {reservation &&
              !['RELEASED', 'RESERVATION_FAILED'].includes(
                reservation.status,
              ) &&
              reservation.items.some((item) => item.reservedQuantity > 0) &&
              permissions.canRelease ? (
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium">
                    Release reason
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-lg border bg-background p-3"
                      maxLength={500}
                      onChange={(event) => setReleaseReason(event.target.value)}
                      required
                      value={releaseReason}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <ActionButton
                      disabled={!releaseReason.trim() || !hasReleaseSelection}
                      icon={Unlock}
                      label="Release selected"
                      onClick={() =>
                        setConfirmation({ action: 'release-selected' })
                      }
                      pending={pending}
                    />
                    <ActionButton
                      disabled={!releaseReason.trim()}
                      icon={ShieldAlert}
                      label="Release entire reservation"
                      onClick={() => setConfirmation({ action: 'release-all' })}
                      pending={pending}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {reservation?.activities.length ? (
            <div className="mt-5">
              <h3 className="font-semibold">Reservation activity</h3>
              <ol className="mt-3 space-y-3">
                {reservation.activities.map((activity) => (
                  <li className="border-l-2 pl-4 text-sm" key={activity.id}>
                    <p className="font-medium">
                      {activity.type.replaceAll('_', ' ')}
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleString()}
                      {activity.actor
                        ? ` · ${activity.actor.firstName} ${activity.actor.lastName}`
                        : ''}
                    </p>
                    {activity.reason ? (
                      <p className="mt-1">{activity.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}

      {confirmation ? (
        <div
          aria-describedby="reservation-confirm-description"
          aria-labelledby="reservation-confirm-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          role="alertdialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !pending) setConfirmation(null);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
            <h3
              className="text-lg font-semibold"
              id="reservation-confirm-title"
            >
              Confirm reservation action
            </h3>
            <p
              className="mt-2 text-sm text-muted-foreground"
              id="reservation-confirm-description"
            >
              This changes internal date-range commitments and records
              append-only history. It does not change the confirmed order or
              check equipment out.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-lg border px-4 font-semibold"
                disabled={pending}
                onClick={() => setConfirmation(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() => void mutate(confirmation.action)}
                type="button"
              >
                {pending ? 'Applying…' : 'Confirm action'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InitialSerializedAssets({
  availability,
  eligible,
  loadEligibleAssets,
  selectedAssets,
  setSelectedAssets,
}: {
  availability: AdminOrderAvailabilityResponse;
  eligible: Record<string, AdminEligibleAssetsResponse['items']>;
  loadEligibleAssets: (itemId: string) => Promise<void>;
  selectedAssets: Record<string, string[]>;
  setSelectedAssets: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
}) {
  const serialized = availability.items.filter(
    (item) => item.trackingMode === 'SERIALIZED',
  );
  if (!serialized.length) return null;
  return (
    <div
      className="mt-5 space-y-4"
      aria-labelledby="serialized-selection-heading"
    >
      <h3 className="font-semibold" id="serialized-selection-heading">
        Select serialized assets
      </h3>
      <p className="text-sm text-muted-foreground">
        Serialized reservations require explicit staff selection. The server
        rechecks each asset and the rental-date overlap during the transaction.
      </p>
      {serialized.map((item) => (
        <fieldset
          className="rounded-lg border p-4"
          key={item.rentalOrderItemId}
        >
          <legend className="px-1 font-medium">{item.productName}</legend>
          <p className="text-sm text-muted-foreground">
            Select {item.orderedQuantity} for a full reservation;{' '}
            {Math.min(item.orderedQuantity, item.availableToReserve)} can be
            selected for an intentional partial reservation.
          </p>
          <button
            className="mt-3 min-h-11 rounded-lg border px-4 text-sm font-semibold"
            onClick={() => void loadEligibleAssets(item.rentalOrderItemId)}
            type="button"
          >
            Load eligible assets
          </button>
          {eligible[item.rentalOrderItemId] ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {eligible[item.rentalOrderItemId]!.length ? (
                eligible[item.rentalOrderItemId]!.map((asset) => (
                  <label
                    className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
                    key={asset.id}
                  >
                    <input
                      checked={(
                        selectedAssets[item.rentalOrderItemId] ?? []
                      ).includes(asset.id)}
                      onChange={(event) =>
                        setSelectedAssets((current) => ({
                          ...current,
                          [item.rentalOrderItemId]: event.target.checked
                            ? [
                                ...(current[item.rentalOrderItemId] ?? []),
                                asset.id,
                              ]
                            : (current[item.rentalOrderItemId] ?? []).filter(
                                (id) => id !== asset.id,
                              ),
                        }))
                      }
                      type="checkbox"
                    />
                    <span>
                      {asset.assetNumber}
                      {asset.serialNumber ? ` · ${asset.serialNumber}` : ''}
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No eligible assets for these dates.
                </p>
              )}
            </div>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}

function Metric({
  label,
  privateValue = false,
  value,
  warning = false,
}: {
  label: string;
  privateValue?: boolean;
  value: number | undefined;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${warning ? 'text-amber-700 dark:text-amber-300' : ''}`}
      >
        {value ?? '—'}
      </p>
      {privateValue ? (
        <p className="mt-1 text-xs text-muted-foreground">Internal only</p>
      ) : null}
    </div>
  );
}

function ActionButton({
  disabled = false,
  icon: Icon,
  label,
  onClick,
  pending,
  primary = false,
}: {
  disabled?: boolean;
  icon: typeof PackageCheck;
  label: string;
  onClick: () => void;
  pending: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold disabled:opacity-50 ${primary ? 'bg-primary text-primary-foreground' : 'border bg-background'}`}
      disabled={disabled || pending}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function ReservationAssets({
  eligible,
  loadEligibleAssets,
  releaseAssets,
  releaseQuantities,
  reservation,
  selectedAssets,
  setReleaseAssets,
  setReleaseQuantities,
  setSelectedAssets,
}: {
  eligible: Record<string, AdminEligibleAssetsResponse['items']>;
  loadEligibleAssets: (itemId: string) => Promise<void>;
  releaseAssets: Record<string, string[]>;
  releaseQuantities: Record<string, number>;
  reservation: AdminInventoryReservationResponse;
  selectedAssets: Record<string, string[]>;
  setReleaseAssets: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  setReleaseQuantities: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  setSelectedAssets: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
}) {
  return (
    <div className="mt-5 space-y-4">
      {reservation.items.map((item) => (
        <div className="rounded-lg border p-4" key={item.rentalOrderItemId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{item.productName}</h3>
            <span className="text-sm text-muted-foreground">
              {item.trackingMode} · {item.reservedQuantity} reserved ·{' '}
              {item.shortfallQuantity} short
            </span>
          </div>
          {item.trackingMode === 'BULK' && item.reservedQuantity > 0 ? (
            <label className="mt-3 block max-w-xs text-sm font-medium">
              Quantity to release
              <input
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
                max={item.reservedQuantity}
                min={1}
                onChange={(event) =>
                  setReleaseQuantities((current) => ({
                    ...current,
                    [item.rentalOrderItemId]: Number(event.target.value) || 0,
                  }))
                }
                type="number"
                value={releaseQuantities[item.rentalOrderItemId] || ''}
              />
            </label>
          ) : null}
          {item.trackingMode === 'SERIALIZED' ? (
            <div className="mt-3 space-y-3">
              {item.allocations.filter(
                (allocation) => allocation.status === 'ACTIVE',
              ).length ? (
                <fieldset>
                  <legend className="text-sm font-medium">
                    Allocated assets to release
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {item.allocations
                      .filter((allocation) => allocation.status === 'ACTIVE')
                      .map((allocation) => (
                        <label
                          className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
                          key={allocation.allocationId}
                        >
                          <input
                            checked={(
                              releaseAssets[item.rentalOrderItemId] ?? []
                            ).includes(allocation.allocationId)}
                            onChange={(event) =>
                              setReleaseAssets((current) => ({
                                ...current,
                                [item.rentalOrderItemId]: event.target.checked
                                  ? [
                                      ...(current[item.rentalOrderItemId] ??
                                        []),
                                      allocation.allocationId,
                                    ]
                                  : (
                                      current[item.rentalOrderItemId] ?? []
                                    ).filter(
                                      (id) => id !== allocation.allocationId,
                                    ),
                              }))
                            }
                            type="checkbox"
                          />
                          <span>
                            {allocation.assetNumber}
                            {allocation.serialNumber
                              ? ` · ${allocation.serialNumber}`
                              : ''}
                          </span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              ) : null}
              {item.shortfallQuantity > 0 ? (
                <div>
                  <button
                    className="min-h-11 rounded-lg border px-4 text-sm font-semibold"
                    onClick={() =>
                      void loadEligibleAssets(item.rentalOrderItemId)
                    }
                    type="button"
                  >
                    Load eligible assets
                  </button>
                  {eligible[item.rentalOrderItemId] ? (
                    <fieldset className="mt-3">
                      <legend className="text-sm font-medium">
                        Assets to allocate while completing the shortfall
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {eligible[item.rentalOrderItemId]!.length ? (
                          eligible[item.rentalOrderItemId]!.map((asset) => (
                            <label
                              className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
                              key={asset.id}
                            >
                              <input
                                checked={(
                                  selectedAssets[item.rentalOrderItemId] ?? []
                                ).includes(asset.id)}
                                onChange={(event) =>
                                  setSelectedAssets((current) => ({
                                    ...current,
                                    [item.rentalOrderItemId]: event.target
                                      .checked
                                      ? [
                                          ...(current[item.rentalOrderItemId] ??
                                            []),
                                          asset.id,
                                        ]
                                      : (
                                          current[item.rentalOrderItemId] ?? []
                                        ).filter((id) => id !== asset.id),
                                  }))
                                }
                                type="checkbox"
                              />
                              <span>
                                {asset.assetNumber}
                                {asset.serialNumber
                                  ? ` · ${asset.serialNumber}`
                                  : ''}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No eligible assets for these dates.
                          </p>
                        )}
                      </div>
                    </fieldset>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
