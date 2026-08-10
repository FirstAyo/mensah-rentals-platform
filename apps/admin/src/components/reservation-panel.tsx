'use client';

import type {
  AdminEligibleAssetsResponse,
  AdminInventoryReservationResponse,
  AdminOrderAvailabilityResponse,
  RentalOrderReservationStatusResponse,
} from '@mensah-rentals/types';
import {
  CheckCircle2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateWorkSummary } from '@/lib/work-summary';
import { AccessibleDialog } from './accessible-dialog';
import {
  buildReservationPreview,
  mapReservationApiError,
  reservationStatusLabel,
  type ReservationPreview,
} from '@/lib/reservation-preview';

interface ReservationPermissions {
  canComplete: boolean;
  canCreate: boolean;
  canOverride: boolean;
  canRelease: boolean;
  canViewAvailability: boolean;
  canViewReservation: boolean;
}

type Confirmation =
  | {
      action:
        | 'complete'
        | 'complete-partial'
        | 'create-full'
        | 'create-partial';
    }
  | { action: 'release-all' | 'release-selected' };

const statusStyles: Record<string, string> = {
  RESERVATION_FAILED: 'bg-destructive/10 text-destructive',
  PARTIALLY_RESERVED: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  RELEASED: 'bg-muted text-muted-foreground',
  RESERVED: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
};

export function ReservationPanel({
  orderId,
  orderReservationStatus,
  permissions,
}: {
  orderId: string;
  orderReservationStatus: RentalOrderReservationStatusResponse;
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
  const [resolutionType, setResolutionType] = useState<
    'SUBRENT' | 'PARTNER_SOURCE' | 'TRANSFER' | 'OTHER'
  >('SUBRENT');
  const [shortfallConfirmed, setShortfallConfirmed] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [preview, setPreview] = useState<ReservationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);
  const dialogReturnFocusRef = useRef<HTMLButtonElement>(null);

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
        else {
          const body: unknown = await reservationResponse
            .json()
            .catch(() => null);
          throw new Error(
            mapReservationApiError(reservationResponse.status, body).message,
          );
        }
      }
      if (availabilityResponse) {
        if (!availabilityResponse.ok) {
          const body: unknown = await availabilityResponse
            .json()
            .catch(() => null);
          throw new Error(
            mapReservationApiError(availabilityResponse.status, body).message,
          );
        }
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
  async function checkAvailability(action: 'create' | 'complete') {
    if (checking || pending || !permissions.canViewAvailability) return;
    setChecking(true);
    setError(null);
    setSuccess(null);
    setReasonError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/availability`, {
        cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const mapped = mapReservationApiError(response.status, body);
        throw new Error(mapped.message);
      }
      const latestAvailability = body as AdminOrderAvailabilityResponse;
      setAvailability(latestAvailability);
      const latestPreview = buildReservationPreview(
        latestAvailability,
        reservation,
      );
      setPreview(latestPreview);
      setConfirmation({
        action:
          action === 'create'
            ? latestPreview.fullReservationPossible
              ? 'create-full'
              : 'create-partial'
            : latestPreview.fullReservationPossible
              ? 'complete'
              : 'complete-partial',
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Internal availability could not be checked.',
      );
    } finally {
      setChecking(false);
    }
  }

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
    const partial =
      action === 'create-partial' || action === 'complete-partial';
    if (partial && !permissions.canOverride) {
      setError(
        'You do not have permission to reserve less than the confirmed order quantity.',
      );
      return;
    }
    if (partial && !overrideReason.trim()) {
      setReasonError('Enter an internal reason for the partial reservation.');
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    setReasonError(null);
    try {
      let url = `/api/orders/${orderId}/reservations`;
      let body: Record<string, unknown> = { operationId: crypto.randomUUID() };
      if (action === 'create-full' || action === 'create-partial') {
        body = {
          ...body,
          allowPartial: partial,
          confirmShortfallPlan: partial ? shortfallConfirmed : false,
          ...(partial && permissions.canOverride && overrideReason.trim()
            ? { overrideReason: overrideReason.trim() }
            : {}),
          ...(partial ? { resolutionType } : {}),
          serializedSelections: serializedSelections(),
        };
      } else if (
        (action === 'complete' || action === 'complete-partial') &&
        reservation
      ) {
        url += `/${reservation.id}/complete`;
        body = {
          ...body,
          allowPartial: partial,
          confirmShortfallPlan: partial ? shortfallConfirmed : false,
          expectedVersion: reservation.version,
          ...(partial ? { overrideReason: overrideReason.trim() } : {}),
          ...(partial ? { resolutionType } : {}),
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
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const mapped = mapReservationApiError(response.status, responseBody);
        await load();
        if (mapped.items) {
          const items = mapped.items;
          setPreview({
            fullReservationPossible: items.every(
              (item) => item.missingQuantity === 0,
            ),
            items,
            missingTotal: items.reduce(
              (sum, item) => sum + item.missingQuantity,
              0,
            ),
            reservableNowTotal: items.reduce(
              (sum, item) => sum + item.quantityCanBeReservedNow,
              0,
            ),
          });
          setConfirmation({ action: 'complete-partial' });
        }
        throw new Error(mapped.message);
      }
      const applied = responseBody as AdminInventoryReservationResponse;
      setConfirmation(null);
      setPreview(null);
      setOverrideReason('');
      setShortfallConfirmed(false);
      setReleaseReason('');
      setReleaseAssets({});
      setReleaseQuantities({});
      setSelectedAssets({});
      setReservation(applied);
      const resultShortfall = applied.items.reduce(
        (sum, item) => sum + item.shortfallQuantity,
        0,
      );
      setSuccess(
        resultShortfall > 0
          ? `Partial reservation saved. ${resultShortfall} item${resultShortfall === 1 ? '' : 's'} remain in the recorded shortfall.`
          : 'The confirmed order is now reserved in full.',
      );
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
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Staff-only workflow
        </p>
        <h2 className="mt-1 text-xl font-semibold">Inventory reservation</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Reservations are created from confirmed rental orders and are visible
          only to staff.
        </p>
        <p className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
          You do not have permission to view internal reservation status or
          inventory availability.
        </p>
      </section>
    );

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
  const livePreview = availability
    ? buildReservationPreview(availability, reservation)
    : null;
  const partialConfirmation =
    confirmation?.action === 'create-partial' ||
    confirmation?.action === 'complete-partial';
  const reservationConfirmation = Boolean(
    confirmation &&
      !['release-all', 'release-selected'].includes(confirmation.action),
  );
  const partialActionUnavailable = Boolean(
    partialConfirmation &&
      (!permissions.canOverride ||
        !shortfallConfirmed ||
        serializedPartialSelectionIncomplete),
  );
  const fullActionUnavailable = Boolean(
    confirmation?.action === 'create-full' && serializedFullSelectionIncomplete,
  );

  return (
    <section
      aria-labelledby="reservation-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Staff-only workflow
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="reservation-heading">
            Inventory reservation
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Reservations are created from confirmed rental orders and are
            visible only to staff. They commit internal inventory for the order
            dates without changing the confirmed order or checking equipment
            out.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${statusStyles[reservation?.status ?? ''] ?? 'bg-muted'}`}
          >
            {reservationStatusLabel(
              reservation?.status && reservation.status !== 'PENDING'
                ? reservation.status
                : orderReservationStatus,
            )}
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
      {success ? (
        <p
          className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm"
          role="status"
        >
          {success}
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

          {reservation ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric
                label="Internal reservation"
                value={reservation.items.reduce(
                  (sum, item) => sum + item.reservedQuantity,
                  0,
                )}
              />
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Order coverage
                </p>
                <p className="mt-1 font-semibold">
                  {reservation.coverageStatus === 'FULLY_INTERNAL'
                    ? 'Complete — fully internal'
                    : reservation.coverageStatus === 'SHORTFALL_ACKNOWLEDGED'
                      ? 'Approved — order may proceed'
                      : 'Shortfall plan required'}
                </p>
              </div>
            </div>
          ) : null}

          {availability ? (
            <div
              aria-label="Reservation quantities by equipment item"
              className="mt-5 grid gap-3 lg:grid-cols-2"
            >
              {livePreview?.items.map((item) => (
                <article
                  className="min-w-0 rounded-lg border bg-background p-4"
                  key={item.rentalOrderItemId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="break-words font-semibold">
                      {item.productName}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">
                      {item.trackingMode ?? 'No inventory record'}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Quantity
                      label="Ordered quantity"
                      value={item.orderedQuantity}
                    />
                    <Quantity
                      label="Already reserved"
                      value={item.alreadyReservedQuantity}
                    />
                    <Quantity
                      label="Currently available"
                      privateValue
                      value={item.currentlyAvailableQuantity}
                    />
                    <Quantity
                      label="Can reserve now"
                      privateValue
                      value={item.quantityCanBeReservedNow}
                    />
                    <Quantity
                      label="Missing quantity"
                      value={item.missingQuantity}
                      warning={item.missingQuantity > 0}
                    />
                    {item.serializedAssetShortage !== null ? (
                      <Quantity
                        label="Serialized-asset shortage"
                        value={item.serializedAssetShortage}
                        warning={item.serializedAssetShortage > 0}
                      />
                    ) : null}
                  </dl>
                </article>
              ))}
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
              <div className="flex flex-wrap gap-3">
                {!reservation && permissions.canCreate ? (
                  <ActionButton
                    disabled={!permissions.canViewAvailability}
                    icon={checking ? Loader2 : PackageCheck}
                    label={
                      checking
                        ? 'Checking availability...'
                        : 'Check availability and reserve'
                    }
                    onClick={(event) => {
                      dialogReturnFocusRef.current = event.currentTarget;
                      void checkAvailability('create');
                    }}
                    pending={pending || checking}
                    primary
                  />
                ) : null}
                {(reservation?.status === 'NOT_RESERVED' ||
                  reservation?.status === 'PARTIALLY_RESERVED' ||
                  reservation?.status === 'PARTIALLY_CONSUMED' ||
                  reservation?.status === 'RESERVATION_FAILED') &&
                permissions.canComplete ? (
                  <ActionButton
                    disabled={!permissions.canViewAvailability}
                    icon={checking ? Loader2 : CheckCircle2}
                    label={
                      checking
                        ? 'Checking availability...'
                        : reservation.status === 'RESERVATION_FAILED'
                          ? 'Check availability and retry'
                          : 'Check availability to complete shortfall'
                    }
                    onClick={(event) => {
                      dialogReturnFocusRef.current = event.currentTarget;
                      void checkAvailability('complete');
                    }}
                    pending={pending || checking}
                    primary
                  />
                ) : null}
              </div>
              {!permissions.canViewAvailability &&
              (permissions.canCreate || permissions.canComplete) ? (
                <p className="text-sm text-muted-foreground">
                  Internal availability permission is required before a
                  reservation can be checked and applied.
                </p>
              ) : null}
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
                      onClick={(event) => {
                        dialogReturnFocusRef.current = event.currentTarget;
                        setConfirmation({ action: 'release-selected' });
                      }}
                      pending={pending}
                    />
                    <ActionButton
                      disabled={!releaseReason.trim()}
                      icon={ShieldAlert}
                      label="Release entire reservation"
                      onClick={(event) => {
                        dialogReturnFocusRef.current = event.currentTarget;
                        setConfirmation({ action: 'release-all' });
                      }}
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

      <AccessibleDialog
        descriptionId="reservation-confirm-description"
        initialFocusRef={
          partialConfirmation ? reasonInputRef : confirmButtonRef
        }
        onClose={() => {
          if (!pending) setConfirmation(null);
        }}
        open={Boolean(confirmation)}
        returnFocusRef={dialogReturnFocusRef}
        titleId="reservation-confirm-title"
      >
        {confirmation ? (
          <div className="p-4 sm:p-6">
            <h3
              className="text-lg font-semibold"
              id="reservation-confirm-title"
            >
              {partialConfirmation
                ? 'Full reservation is not currently possible.'
                : confirmation.action.startsWith('release')
                  ? 'Confirm reservation release'
                  : 'Confirm full reservation'}
            </h3>
            <p
              className="mt-2 text-sm text-muted-foreground"
              id="reservation-confirm-description"
            >
              {reservationConfirmation
                ? 'Review the current date-range quantities before changing the internal inventory commitment. This does not check equipment out.'
                : 'This records an append-only release without changing the confirmed order.'}
            </p>

            {reservationConfirmation && preview ? (
              <div className="mt-5 space-y-3">
                {preview.items.map((item) => (
                  <article
                    className="rounded-lg border bg-background p-3"
                    key={item.rentalOrderItemId}
                  >
                    <h4 className="break-words font-semibold">
                      {item.productName}
                    </h4>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <Quantity label="Ordered" value={item.orderedQuantity} />
                      <Quantity
                        label="Already reserved"
                        value={item.alreadyReservedQuantity}
                      />
                      <Quantity
                        label="Available now"
                        privateValue
                        value={item.currentlyAvailableQuantity}
                      />
                      <Quantity
                        label="Reserve now"
                        privateValue
                        value={item.quantityCanBeReservedNow}
                      />
                      <Quantity
                        label="Missing"
                        value={item.missingQuantity}
                        warning={item.missingQuantity > 0}
                      />
                      {item.serializedAssetShortage !== null ? (
                        <Quantity
                          label="Serialized shortage"
                          value={item.serializedAssetShortage}
                          warning={item.serializedAssetShortage > 0}
                        />
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            ) : null}

            {partialConfirmation ? (
              <div className="mt-5 space-y-4">
                <label
                  className="block text-sm font-medium"
                  htmlFor="reservation-resolution-type"
                >
                  Shortfall resolution
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    id="reservation-resolution-type"
                    onChange={(event) =>
                      setResolutionType(
                        event.target.value as typeof resolutionType,
                      )
                    }
                    value={resolutionType}
                  >
                    <option value="SUBRENT">Subrent</option>
                    <option value="PARTNER_SOURCE">Partner source</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label
                  className="block text-sm font-medium"
                  htmlFor="reservation-override-reason"
                >
                  Internal shortfall reason <span aria-hidden="true">*</span>
                </label>
                <textarea
                  aria-describedby={`reservation-override-help${reasonError ? ' reservation-override-error' : ''}`}
                  aria-invalid={Boolean(reasonError)}
                  className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3"
                  id="reservation-override-reason"
                  maxLength={500}
                  onChange={(event) => {
                    setOverrideReason(event.target.value);
                    setReasonError(null);
                  }}
                  placeholder="For example: Sub-rent remaining equipment"
                  ref={reasonInputRef}
                  value={overrideReason}
                />
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  id="reservation-override-help"
                >
                  Staff-only. Examples include purchase, transfer, sub-rental,
                  or awaiting stock.
                </p>
                {reasonError ? (
                  <p
                    className="mt-2 text-sm text-destructive"
                    id="reservation-override-error"
                    role="alert"
                  >
                    {reasonError}
                  </p>
                ) : null}
                {!permissions.canOverride ? (
                  <p
                    className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                    role="alert"
                  >
                    You do not have permission to reserve less than the
                    confirmed order quantity.
                  </p>
                ) : null}
                {!preview?.reservableNowTotal ? (
                  <p className="mt-2 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
                    Nothing can be reserved for these dates right now. No
                    inventory will be committed.
                  </p>
                ) : null}
                <label className="flex min-h-11 items-start gap-3 rounded-lg border bg-background p-3 text-sm">
                  <input
                    checked={shortfallConfirmed}
                    className="mt-1 h-4 w-4"
                    onChange={(event) =>
                      setShortfallConfirmed(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    I confirm that the remaining shortfall has an internal
                    fulfilment plan.
                  </span>
                </label>
              </div>
            ) : null}

            {reservationConfirmation &&
            (partialConfirmation
              ? serializedPartialSelectionIncomplete
              : serializedFullSelectionIncomplete) ? (
              <p className="mt-4 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
                Select the required serialized assets before continuing.
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
                disabled={
                  pending || partialActionUnavailable || fullActionUnavailable
                }
                onClick={() => void mutate(confirmation.action)}
                type="button"
              >
                {pending
                  ? 'Applying…'
                  : partialConfirmation
                    ? 'Reserve available quantity'
                    : confirmation.action.startsWith('release')
                      ? 'Confirm release'
                      : 'Reserve in full'}
              </button>
            </div>
          </div>
        ) : null}
      </AccessibleDialog>
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

function Quantity({
  label,
  privateValue = false,
  value,
  warning = false,
}: {
  label: string;
  privateValue?: boolean;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 font-semibold tabular-nums ${warning ? 'text-amber-700 dark:text-amber-300' : ''}`}
      >
        {value}
        {privateValue ? (
          <span className="block text-[0.6875rem] font-normal text-muted-foreground">
            Internal only
          </span>
        ) : null}
      </dd>
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
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
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
          {item.shortfallPlan ? (
            <p className="mt-2 rounded-md bg-muted p-2 text-sm">
              Shortfall plan: {item.shortfallPlan.status.replaceAll('_', ' ')}
              {item.shortfallPlan.resolutionType
                ? ` / ${item.shortfallPlan.resolutionType.replaceAll('_', ' ')}`
                : ''}
              {item.shortfallPlan.acknowledgedQuantity > 0
                ? ` / ${item.shortfallPlan.acknowledgedQuantity} covered externally`
                : ''}
            </p>
          ) : null}
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
