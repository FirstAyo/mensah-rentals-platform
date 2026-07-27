'use client';

import type {
  AdminRentalRequestSummaryResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ClipboardList, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const field =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function statusBadge(status: string) {
  return status === 'UNDER_REVIEW'
    ? 'bg-primary/15 text-foreground'
    : 'bg-muted text-muted-foreground';
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function date(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(year!, month! - 1, day!),
  );
}

const columnHelper = createColumnHelper<AdminRentalRequestSummaryResponse>();

function QueueBody() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assignment, setAssignment] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState('');
  const [sortBy, setSortBy] = useState('submittedAt');
  const [sortDirection, setSortDirection] = useState('desc');

  const queue = useQuery<PaginatedResponse<AdminRentalRequestSummaryResponse>>({
    queryKey: [
      'rental-request-queue',
      page,
      search,
      status,
      assignment,
      fulfillmentMethod,
      sortBy,
      sortDirection,
    ],
    queryFn: async () => {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        sortBy,
        sortDirection,
      });
      if (search.trim()) query.set('search', search.trim());
      if (status) query.set('status', status);
      if (assignment) query.set('assignment', assignment);
      if (fulfillmentMethod) query.set('fulfillmentMethod', fulfillmentMethod);
      const response = await fetch(`/api/rental-requests?${query}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to load rental requests.');
      return response.json() as Promise<
        PaginatedResponse<AdminRentalRequestSummaryResponse>
      >;
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('referenceNumber', {
        header: 'Request',
        cell: ({ row }) => (
          <div>
            <Link
              className="font-semibold text-foreground underline underline-offset-4"
              href={`/rental-requests/${row.original.id}`}
            >
              {row.original.referenceNumber}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.original.projectName}
            </p>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <p>
              {row.original.contactFirstName} {row.original.contactLastName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.original.contactEmail}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(getValue())}`}
          >
            {humanize(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'rentalDates',
        header: 'Rental dates',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {date(row.original.rentalStartDate)} –{' '}
            {date(row.original.rentalEndDate)}
          </span>
        ),
      }),
      columnHelper.accessor('assignedTo', {
        header: 'Assignment',
        cell: ({ getValue }) => {
          const assignee = getValue();
          return assignee ? (
            `${assignee.firstName} ${assignee.lastName}`
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          );
        },
      }),
      columnHelper.accessor('submittedAt', {
        header: 'Submitted',
        cell: ({ getValue }) => date(getValue()),
      }),
    ],
    [],
  );
  const table = useReactTable({
    data: queue.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Staff review
        </p>
        <h1 className="mt-2 text-3xl font-bold">Rental requests</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Review submitted requests and coordinate staff follow-up. Assignment
          and review do not approve a request or reserve inventory.
        </p>
      </header>

      <section
        aria-label="Rental request filters"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="relative sm:col-span-2 xl:col-span-2">
          <span className="sr-only">Search requests</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <input
            className={`${field} w-full pl-9`}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Reference, customer, email or phone"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select
            className={`${field} w-full`}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="APPROVED">Approved</option>
            <option value="PARTIALLY_APPROVED">Partially approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Assignment</span>
          <select
            className={`${field} w-full`}
            onChange={(event) => {
              setAssignment(event.target.value);
              resetPage();
            }}
            value={assignment}
          >
            <option value="">All assignments</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="UNASSIGNED">Unassigned</option>
            <option value="MINE">Assigned to me</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Fulfillment method</span>
          <select
            className={`${field} w-full`}
            onChange={(event) => {
              setFulfillmentMethod(event.target.value);
              resetPage();
            }}
            value={fulfillmentMethod}
          >
            <option value="">All fulfillment</option>
            <option value="PICKUP">Pickup</option>
            <option value="DELIVERY">Delivery</option>
            <option value="DELIVERY_AND_SETUP">Delivery and setup</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort requests</span>
          <select
            className={`${field} w-full`}
            onChange={(event) => {
              const [nextSort, nextDirection] = event.target.value.split(':');
              setSortBy(nextSort!);
              setSortDirection(nextDirection!);
              resetPage();
            }}
            value={`${sortBy}:${sortDirection}`}
          >
            <option value="submittedAt:desc">Newest submitted</option>
            <option value="submittedAt:asc">Oldest submitted</option>
            <option value="rentalStartDate:asc">Rental date soonest</option>
            <option value="rentalStartDate:desc">Rental date latest</option>
            <option value="updatedAt:desc">Recent activity</option>
          </select>
        </label>
      </section>

      {queue.isLoading ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-border bg-card p-8"
        >
          Loading rental requests…
        </div>
      ) : null}
      {queue.isError ? (
        <div
          className="rounded-xl border border-border bg-card p-6"
          role="alert"
        >
          <p>Unable to load rental requests.</p>
          <button
            className="mt-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
            onClick={() => void queue.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {queue.data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <ClipboardList
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-muted-foreground"
          />
          <p className="mt-3 font-semibold">No matching rental requests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try changing the search or filters.
          </p>
        </div>
      ) : null}

      {queue.data?.items.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/60">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th className="p-4 font-semibold" key={header.id}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr className="border-t border-border" key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td className="p-4 align-top" key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {queue.data.items.map((request) => (
              <article
                className="rounded-xl border border-border bg-card p-4"
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    className="font-bold text-foreground underline underline-offset-4"
                    href={`/rental-requests/${request.id}`}
                  >
                    {request.referenceNumber}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(request.status)}`}
                  >
                    {humanize(request.status)}
                  </span>
                </div>
                <p className="mt-3 font-medium">
                  {request.contactFirstName} {request.contactLastName}
                </p>
                <p className="break-all text-sm text-muted-foreground">
                  {request.contactEmail}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Rental dates</dt>
                    <dd>{date(request.rentalStartDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assigned to</dt>
                    <dd>
                      {request.assignedTo
                        ? `${request.assignedTo.firstName} ${request.assignedTo.lastName}`
                        : 'Unassigned'}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {queue.data && queue.data.meta.totalPages > 1 ? (
        <nav
          aria-label="Rental request pages"
          className="flex items-center justify-between gap-3"
        >
          <button
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {queue.data.meta.page} of {queue.data.meta.totalPages}
          </span>
          <button
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={page >= queue.data.meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function RentalRequestQueue() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <QueueBody />
    </QueryClientProvider>
  );
}
