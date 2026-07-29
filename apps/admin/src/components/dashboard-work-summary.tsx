'use client';

import type { AdminWorkSummaryResponse } from '@mensah-rentals/types';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileClock,
  PackageCheck,
  PackageOpen,
  Quote,
  ShoppingBag,
  Truck,
  Clock3,
} from 'lucide-react';
import { useWorkSummary } from '@/lib/work-summary';

const cards = [
  {
    key: 'submitted',
    label: 'Submitted awaiting review',
    permissions: ['rental_request.view'],
    icon: ClipboardList,
    value: (data: AdminWorkSummaryResponse) =>
      data.rentalRequests?.submittedAwaitingReview,
  },
  {
    key: 'review',
    label: 'Under review',
    permissions: ['rental_request.view'],
    icon: FileClock,
    value: (data: AdminWorkSummaryResponse) => data.rentalRequests?.underReview,
  },
  {
    key: 'approved',
    label: 'Approved, eligible for quote',
    permissions: ['rental_request.view', 'quote.create'],
    icon: FileCheck2,
    value: (data: AdminWorkSummaryResponse) =>
      data.rentalRequests?.approvedAwaitingQuote,
  },
  {
    key: 'sent',
    label: 'Sent, awaiting response',
    permissions: ['quote.view'],
    icon: Quote,
    value: (data: AdminWorkSummaryResponse) =>
      data.quotes?.sentAwaitingResponse,
  },
  {
    key: 'accepted',
    label: 'Accepted, awaiting order',
    permissions: ['quote.view', 'order.create'],
    icon: ShoppingBag,
    value: (data: AdminWorkSummaryResponse) =>
      data.quotes?.acceptedAwaitingOrder,
  },
  {
    key: 'unreserved',
    label: 'Confirmed, not reserved',
    permissions: ['order.view', 'inventory.reservation.view'],
    icon: PackageCheck,
    value: (data: AdminWorkSummaryResponse) =>
      data.reservations?.awaitingReservation,
  },
  {
    key: 'partial-reservations',
    label: 'Partially reserved orders',
    permissions: ['order.view', 'inventory.reservation.view'],
    icon: AlertTriangle,
    value: (data: AdminWorkSummaryResponse) =>
      data.reservations?.partiallyReserved,
  },
  {
    key: 'full-reservations',
    label: 'Fully reserved orders',
    permissions: ['order.view', 'inventory.reservation.view'],
    icon: PackageOpen,
    value: (data: AdminWorkSummaryResponse) => data.reservations?.fullyReserved,
  },
  {
    key: 'reservation-shortfall',
    label: 'Unresolved shortfall quantity',
    permissions: ['order.view', 'inventory.reservation.view'],
    icon: AlertTriangle,
    value: (data: AdminWorkSummaryResponse) =>
      data.reservations?.unresolvedShortfallQuantity,
  },
  {
    key: 'upcoming',
    label: 'Upcoming rental dates',
    permissions: ['order.view'],
    icon: CalendarClock,
    value: (data: AdminWorkSummaryResponse) => data.orders?.upcomingRentalDates,
  },
  {
    key: 'upcoming-reservations',
    label: 'Upcoming active reservations',
    permissions: ['order.view', 'inventory.reservation.view'],
    icon: CalendarClock,
    value: (data: AdminWorkSummaryResponse) =>
      data.reservations?.upcomingReservations,
  },
  {
    key: 'awaiting-preparation',
    label: 'Awaiting preparation',
    permissions: ['fulfilment.view'],
    icon: PackageOpen,
    value: (data: AdminWorkSummaryResponse) =>
      data.fulfilment?.awaitingPreparation,
  },
  {
    key: 'preparing',
    label: 'Preparing',
    permissions: ['fulfilment.view'],
    icon: PackageCheck,
    value: (data: AdminWorkSummaryResponse) => data.fulfilment?.preparing,
  },
  {
    key: 'ready-pickup',
    label: 'Ready for pickup',
    permissions: ['fulfilment.view'],
    icon: PackageCheck,
    value: (data: AdminWorkSummaryResponse) => data.fulfilment?.readyForPickup,
  },
  {
    key: 'ready-delivery',
    label: 'Ready for delivery',
    permissions: ['fulfilment.view'],
    icon: Truck,
    value: (data: AdminWorkSummaryResponse) =>
      data.fulfilment?.readyForDelivery,
  },
  {
    key: 'partial-checkout',
    label: 'Partially checked out',
    permissions: ['fulfilment.view'],
    icon: AlertTriangle,
    value: (data: AdminWorkSummaryResponse) =>
      data.fulfilment?.partiallyCheckedOut,
  },
  {
    key: 'active-rentals',
    label: 'Active rentals',
    permissions: ['active_rental.view'],
    icon: Clock3,
    value: (data: AdminWorkSummaryResponse) => data.activeRentals?.active,
  },
  {
    key: 'returns-today',
    label: 'Expected returns today',
    permissions: ['active_rental.view'],
    icon: CalendarClock,
    value: (data: AdminWorkSummaryResponse) =>
      data.activeRentals?.expectedReturnsToday,
  },
  {
    key: 'overdue-rentals',
    label: 'Overdue active rentals',
    permissions: ['active_rental.view'],
    icon: AlertTriangle,
    value: (data: AdminWorkSummaryResponse) => data.activeRentals?.overdue,
  },
] as const;

export function DashboardWorkSummary({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const visible = cards.filter((card) =>
    card.permissions.every((permission) => permissions.includes(permission)),
  );
  const { data, error, loading, refresh } = useWorkSummary(visible.length > 0);
  if (!visible.length) return null;
  return (
    <section aria-labelledby="work-summary-heading" className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold" id="work-summary-heading">
            Current work
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reliable counts from current request, quote, and confirmed-order
            data.
          </p>
        </div>
        <button
          className="min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold"
          onClick={() => void refresh()}
          type="button"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="underline"
            onClick={() => void refresh()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map(({ key, label, icon: Icon, value }) => (
          <article className="min-w-0 rounded-xl border bg-card p-5" key={key}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {label}
              </p>
              <Icon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-primary"
              />
            </div>
            {loading && !data ? (
              <div
                aria-label={`Loading ${label}`}
                className="mt-4 h-9 w-16 animate-pulse rounded bg-muted"
                role="status"
              />
            ) : (
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {data ? (value(data) ?? '—') : '—'}
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Counts refresh after work changes, on focus, and every 45 seconds while
        visible. No inventory availability is implied.
      </p>
    </section>
  );
}
