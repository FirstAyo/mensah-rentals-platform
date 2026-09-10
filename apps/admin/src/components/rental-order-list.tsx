'use client';

import type {
  AdminRentalOrderSummaryResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});

function RentalOrderListContent({
  canViewReservations,
  canUpdateAssignment,
  nextActionAccess,
  currentUserId,
  workspace,
}: {
  canViewReservations: boolean;
  canUpdateAssignment: boolean;
  nextActionAccess: {
    fulfilmentEnabled: boolean;
    reservationsEnabled: boolean;
    returnsEnabled: boolean;
    canCreateReservation: boolean;
    canUpdateReservation: boolean;
    canPrepare: boolean;
    canCheckout: boolean;
    canViewActiveRental: boolean;
    canViewReturn: boolean;
  };
  currentUserId: string;
  workspace: 'all' | 'approved';
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [reservationStatus, setReservationStatus] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [assignment, setAssignment] = useState('ALL');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [rentalStartFrom, setRentalStartFrom] = useState('');
  const [rentalStartTo, setRentalStartTo] = useState('');
  const [sortBy, setSortBy] = useState<
    'confirmedAt' | 'rentalStartDate' | 'total'
  >('confirmedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const queryString = useMemo(() => {
    const query = new URLSearchParams({
      assignment,
      page: String(page),
      pageSize: '20',
      sortBy,
      sortDirection,
    });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    if (canViewReservations && reservationStatus)
      query.set('reservationStatus', reservationStatus);
    if (fulfillmentMethod) query.set('fulfillmentMethod', fulfillmentMethod);
    if (fulfillmentStatus) query.set('fulfillmentStatus', fulfillmentStatus);
    if (rentalStartFrom) query.set('rentalStartFrom', rentalStartFrom);
    if (rentalStartTo) query.set('rentalStartTo', rentalStartTo);
    return query.toString();
  }, [
    canViewReservations,
    assignment,
    fulfillmentMethod,
    fulfillmentStatus,
    page,
    rentalStartFrom,
    rentalStartTo,
    reservationStatus,
    search,
    sortBy,
    sortDirection,
    status,
  ]);
  const result = useQuery<PaginatedResponse<AdminRentalOrderSummaryResponse>>({
    queryKey: ['rental-orders', queryString],
    queryFn: async () => {
      const response = await fetch(`/api/orders?${queryString}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Rental orders could not be loaded');
      return response.json() as Promise<
        PaginatedResponse<AdminRentalOrderSummaryResponse>
      >;
    },
  });
  const data = result.data;

  function nextActionLabel(order: AdminRentalOrderSummaryResponse) {
    const action = order.nextAction;
    const featureEnabled = [
      'CREATE_RESERVATION',
      'COMPLETE_RESERVATION',
    ].includes(action)
      ? nextActionAccess.reservationsEnabled
      : action === 'VIEW_RETURN'
        ? nextActionAccess.returnsEnabled
        : nextActionAccess.fulfilmentEnabled;
    const permitted =
      action === 'CREATE_RESERVATION'
        ? nextActionAccess.canCreateReservation
        : action === 'COMPLETE_RESERVATION'
          ? nextActionAccess.canUpdateReservation
          : ['START_PREPARATION', 'CONTINUE_PREPARATION'].includes(action)
            ? nextActionAccess.canPrepare
            : action === 'CHECK_OUT'
              ? nextActionAccess.canCheckout
              : action === 'VIEW_ACTIVE_RENTAL'
                ? nextActionAccess.canViewActiveRental
                : nextActionAccess.canViewReturn;
    if (!featureEnabled) return 'Next step unavailable';
    if (!permitted) return 'Next step restricted';
    return `Next: ${action.replaceAll('_', ' ')}`;
  }

  async function assignToMe(order: AdminRentalOrderSummaryResponse) {
    if (assigningId) return;
    setAssigningId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToUserId: currentUserId,
          expectedVersion: order.assignmentVersion,
          operationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error('Assignment failed');
      await result.refetch();
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {workspace === 'approved'
            ? 'Ready for operational processing'
            : 'Confirmed commercial commitments'}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {workspace === 'approved' ? 'Approved Orders' : 'Rental Orders'}
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Orders are created explicitly from an accepted quote. Confirmation
          does not reserve inventory or assign equipment. Assignment is optional
          coordination metadata and never an authorization gate.
        </p>
      </header>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="sr-only">Search rental orders</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search order, quote, request, or customer"
            value={search}
          />
        </label>
        <label>
          <span className="sr-only">Filter by assignment</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setAssignment(event.target.value);
              setPage(1);
            }}
            value={assignment}
          >
            <option value="ALL">All assignments</option>
            <option value="UNASSIGNED">Unassigned</option>
            <option value="MINE">Assigned to me</option>
          </select>
        </label>
        {canViewReservations ? (
          <label>
            <span className="sr-only">Filter by reservation status</span>
            <select
              className="w-full rounded-lg border bg-background px-3 py-2"
              onChange={(event) => {
                setReservationStatus(event.target.value);
                setPage(1);
              }}
              value={reservationStatus}
            >
              <option value="">All reservation states</option>
              <option value="NOT_RESERVED">Not reserved</option>
              <option value="PARTIALLY_RESERVED">Partially reserved</option>
              <option value="RESERVED">Reserved</option>
              <option value="PARTIALLY_CONSUMED">Partially consumed</option>
              <option value="CONSUMED">Consumed</option>
              <option value="RESERVATION_FAILED">Reservation failed</option>
              <option value="RELEASED">Released</option>
            </select>
          </label>
        ) : null}
        <label>
          <span className="sr-only">Filter by fulfillment method</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setFulfillmentMethod(event.target.value);
              setPage(1);
            }}
            value={fulfillmentMethod}
          >
            <option value="">All fulfillment methods</option>
            <option value="PICKUP">Pickup</option>
            <option value="DELIVERY">Delivery</option>
            <option value="DELIVERY_AND_SETUP">Delivery and setup</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by fulfilment status</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setFulfillmentStatus(event.target.value);
              setPage(1);
            }}
            value={fulfillmentStatus}
          >
            <option value="">All fulfilment states</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="PARTIALLY_CHECKED_OUT">Partially checked out</option>
            <option value="CHECKED_OUT">Checked out</option>
          </select>
        </label>
        <label>
          <span className="text-sm text-muted-foreground">
            Rental start from
          </span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setRentalStartFrom(event.target.value);
              setPage(1);
            }}
            type="date"
            value={rentalStartFrom}
          />
        </label>
        <label>
          <span className="text-sm text-muted-foreground">Rental start to</span>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setRentalStartTo(event.target.value);
              setPage(1);
            }}
            type="date"
            value={rentalStartTo}
          />
        </label>
        <label>
          <span className="sr-only">Filter rental orders by status</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort rental orders by</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setSortBy(event.target.value as typeof sortBy);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="confirmedAt">Confirmation date</option>
            <option value="rentalStartDate">Rental start date</option>
            <option value="total">Total</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort rental order direction</span>
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => {
              setSortDirection(event.target.value as typeof sortDirection);
              setPage(1);
            }}
            value={sortDirection}
          >
            <option value="desc">Newest or highest first</option>
            <option value="asc">Oldest or lowest first</option>
          </select>
        </label>
      </div>

      {result.isError ? (
        <p role="alert" className="rounded-xl border p-5">
          Rental orders could not be loaded. Try again.
        </p>
      ) : null}
      {result.isPending ? (
        <p aria-live="polite" className="rounded-xl border p-8">
          Loading rental orders...
        </p>
      ) : null}
      {data?.items.length === 0 ? (
        <p className="rounded-xl border p-8 text-muted-foreground">
          No rental orders match these filters.
        </p>
      ) : null}

      <div className="grid gap-3">
        {data?.items.map((order) => (
          <article
            className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto_auto] xl:items-center"
            key={order.id}
          >
            <div>
              <Link
                className="font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                href={`/orders/${order.id}`}
              >
                {order.orderNumber}
              </Link>
              <p className="text-sm text-muted-foreground">
                {order.rentalRequestReference} · {order.quoteNumber}
              </p>
            </div>
            <div>
              <p>{order.customerName}</p>
              <p className="text-sm text-muted-foreground">
                {order.companyName ?? order.projectName}
              </p>
              <p className="text-sm text-muted-foreground">
                {new Date(order.rentalStartDate).toLocaleDateString()} –{' '}
                {new Date(order.rentalEndDate).toLocaleDateString()}
              </p>
            </div>
            <div className="text-sm">
              <p className="font-semibold">{nextActionLabel(order)}</p>
              <p className="text-muted-foreground">
                {order.fulfilmentStatus.replaceAll('_', ' ')}
              </p>
              {canViewReservations && order.reservationStatus ? (
                <p className="text-muted-foreground">
                  {order.reservationStatus.replaceAll('_', ' ')}
                </p>
              ) : null}
            </div>
            <div>
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                {order.assignedTo
                  ? `${order.assignedTo.firstName} ${order.assignedTo.lastName}`
                  : 'Unassigned'}
              </span>
              {!order.assignedTo && canUpdateAssignment ? (
                <button
                  className="mt-2 block min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
                  disabled={assigningId !== null}
                  onClick={() => void assignToMe(order)}
                  type="button"
                >
                  {assigningId === order.id ? 'Assigning…' : 'Assign to me'}
                </button>
              ) : null}
            </div>
            <p className="font-bold">{cad.format(order.totalCents / 100)}</p>
            <div className="text-sm text-muted-foreground">
              <p>{order.fulfillmentMethod.replaceAll('_', ' ')}</p>
              <p>Confirmed {new Date(order.confirmedAt).toLocaleString()}</p>
            </div>
          </article>
        ))}
      </div>

      {data ? (
        <nav
          aria-label="Rental order pages"
          className="flex items-center justify-between"
        >
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {data.meta.page} of {Math.max(1, data.meta.totalPages)}
          </span>
          <button
            className="rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function RentalOrderList({
  canViewReservations,
  canUpdateAssignment,
  currentUserId,
  nextActionAccess,
  workspace = 'all',
}: {
  canViewReservations: boolean;
  canUpdateAssignment: boolean;
  currentUserId: string;
  nextActionAccess: {
    fulfilmentEnabled: boolean;
    reservationsEnabled: boolean;
    returnsEnabled: boolean;
    canCreateReservation: boolean;
    canUpdateReservation: boolean;
    canPrepare: boolean;
    canCheckout: boolean;
    canViewActiveRental: boolean;
    canViewReturn: boolean;
  };
  workspace?: 'all' | 'approved';
}) {
  return (
    <RentalOrderListContent
      canUpdateAssignment={canUpdateAssignment}
      canViewReservations={canViewReservations}
      currentUserId={currentUserId}
      nextActionAccess={nextActionAccess}
      workspace={workspace}
    />
  );
}
