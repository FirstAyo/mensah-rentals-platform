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
}: {
  canViewReservations: boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [reservationStatus, setReservationStatus] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState('');
  const [rentalStartFrom, setRentalStartFrom] = useState('');
  const [rentalStartTo, setRentalStartTo] = useState('');
  const [sortBy, setSortBy] = useState<
    'confirmedAt' | 'rentalStartDate' | 'total'
  >('confirmedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const queryString = useMemo(() => {
    const query = new URLSearchParams({
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
    if (rentalStartFrom) query.set('rentalStartFrom', rentalStartFrom);
    if (rentalStartTo) query.set('rentalStartTo', rentalStartTo);
    return query.toString();
  }, [
    canViewReservations,
    fulfillmentMethod,
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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Confirmed commercial commitments
        </p>
        <h1 className="mt-2 text-3xl font-bold">Rental Orders</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Orders are created explicitly from an accepted quote. Confirmation
          does not reserve inventory or assign equipment.
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
          <Link
            className="grid gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] xl:items-center"
            href={`/orders/${order.id}`}
            key={order.id}
          >
            <div>
              <p className="font-semibold">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">
                {order.rentalRequestReference} · {order.quoteNumber}
              </p>
            </div>
            <div>
              <p>{order.customerName}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(order.rentalStartDate).toLocaleDateString()} –{' '}
                {new Date(order.rentalEndDate).toLocaleDateString()}
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {order.status}
            </span>
            <span className="text-sm text-muted-foreground">
              {order.fulfillmentMethod.replaceAll('_', ' ')}
            </span>
            {canViewReservations && order.reservationStatus ? (
              <span className="text-sm font-semibold text-muted-foreground">
                {order.reservationStatus.replaceAll('_', ' ')}
              </span>
            ) : null}
            <p className="font-bold">{cad.format(order.totalCents / 100)}</p>
            <p className="text-sm text-muted-foreground">
              Confirmed {new Date(order.confirmedAt).toLocaleString()}
            </p>
          </Link>
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
}: {
  canViewReservations: boolean;
}) {
  return <RentalOrderListContent canViewReservations={canViewReservations} />;
}
