'use client';

import { AlertTriangle, Plus, Search, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MaintenanceNavigation } from './maintenance-navigation';
import type {
  MaintenanceAssignee,
  MaintenancePagination,
  MaintenanceWorkOrderSummary,
} from '@/lib/maintenance-types';
import {
  humanizeMaintenance,
  maintenanceDate,
  maintenanceStaffItems,
} from '@/lib/maintenance-types';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function badge(status: string) {
  return status === 'CANCELLED'
    ? 'bg-destructive/15 text-destructive'
    : status === 'COMPLETED'
      ? 'bg-muted text-muted-foreground'
      : 'bg-primary/15 text-foreground';
}

export function MaintenanceWorkOrderList({
  canCreate,
  canViewInspections,
}: {
  canCreate: boolean;
  canViewInspections: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [assignment, setAssignment] = useState('');
  const [staff, setStaff] = useState<MaintenanceAssignee[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [data, setData] =
    useState<MaintenancePagination<MaintenanceWorkOrderSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    if (search.trim()) query.set('search', search.trim());
    if (status) query.set('status', status);
    if (priority) query.set('priority', priority);
    if (type) query.set('type', type);
    if (assignment) query.set('assignedToUserId', assignment);
    if (overdue) query.set('overdue', 'true');
    setLoading(true);
    setError(null);
    void fetch(`/api/maintenance/work-orders?${query}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Work orders could not be loaded.');
        setData(
          (await response.json()) as MaintenancePagination<MaintenanceWorkOrderSummary>,
        );
      })
      .catch((value) => {
        if (value instanceof DOMException && value.name === 'AbortError')
          return;
        setError(
          value instanceof Error
            ? value.message
            : 'Work orders could not be loaded.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [assignment, overdue, page, priority, search, status, type]);

  useEffect(() => {
    void fetch('/api/maintenance/staff?pageSize=100', {
      cache: 'no-store',
    }).then(async (response) => {
      if (response.ok) setStaff(maintenanceStaffItems(await response.json()));
    });
  }, []);

  const reset = () => setPage(1);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Equipment operations
          </p>
          <h1 className="mt-2 text-3xl font-bold">Maintenance work orders</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Schedule and audit preventive and corrective equipment work. This
            operational information is confidential.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
            href="/maintenance/work-orders/new"
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> Create work order
          </Link>
        ) : null}
      </header>
      <MaintenanceNavigation canViewInspections={canViewInspections} />
      <section
        aria-label="Work-order filters"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search work orders</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
          />
          <input
            className={`${field} pl-9`}
            onChange={(event) => {
              setSearch(event.target.value);
              reset();
            }}
            placeholder="Work order, product, SKU or asset"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select
            className={field}
            onChange={(event) => {
              setStatus(event.target.value);
              reset();
            }}
            value={status}
          >
            <option value="">All statuses</option>
            {[
              'OPEN',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_FOR_PARTS',
              'READY_FOR_INSPECTION',
              'COMPLETED',
              'CANCELLED',
            ].map((value) => (
              <option key={value} value={value}>
                {humanizeMaintenance(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Priority</span>
          <select
            className={field}
            onChange={(event) => {
              setPriority(event.target.value);
              reset();
            }}
            value={priority}
          >
            <option value="">All priorities</option>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
              <option key={value} value={value}>
                {humanizeMaintenance(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Type</span>
          <select
            className={field}
            onChange={(event) => {
              setType(event.target.value);
              reset();
            }}
            value={type}
          >
            <option value="">All types</option>
            <option value="CORRECTIVE">Corrective</option>
            <option value="PREVENTIVE">Preventive</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Assigned staff</span>
          <select
            className={field}
            onChange={(event) => {
              setAssignment(event.target.value);
              reset();
            }}
            value={assignment}
          >
            <option value="">All assigned staff</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2 xl:col-span-1">
          <input
            checked={overdue}
            className="h-5 w-5"
            onChange={(event) => {
              setOverdue(event.target.checked);
              reset();
            }}
            type="checkbox"
          />{' '}
          Overdue only
        </label>
      </section>
      {loading ? (
        <div aria-live="polite" className="rounded-xl border bg-card p-8">
          Loading work orders…
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border bg-card p-6" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {!loading && data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Wrench
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-muted-foreground"
          />
          <p className="mt-3 font-semibold">No matching work orders</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try changing the search or filters.
          </p>
        </div>
      ) : null}
      {data?.items.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {[
                    'Work order',
                    'Equipment',
                    'Type / priority',
                    'Status',
                    'Assignment',
                    'Schedule',
                    '',
                  ].map((label) => (
                    <th className="p-4 font-semibold" key={label}>
                      {label || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr className="border-t border-border" key={item.id}>
                    <td className="p-4">
                      <Link
                        className="font-semibold underline underline-offset-4"
                        href={`/maintenance/work-orders/${item.id}`}
                      >
                        {item.workOrderNumber}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.title}
                      </p>
                    </td>
                    <td className="p-4">
                      {item.productName}
                      <span className="block text-xs text-muted-foreground">
                        {item.assetNumber ??
                          `${item.quantity} bulk unit${item.quantity === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td className="p-4">
                      {humanizeMaintenance(item.type)}
                      <span className="block text-xs text-muted-foreground">
                        {humanizeMaintenance(item.priority)}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge(item.status)}`}
                      >
                        {humanizeMaintenance(item.status)}
                      </span>
                      {item.overdue ? (
                        <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-destructive">
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />{' '}
                          Overdue
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4">
                      {item.assignedStaff ? (
                        `${item.assignedStaff.firstName} ${item.assignedStaff.lastName}`
                      ) : (
                        <span className="text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {maintenanceDate(item.scheduledFor)}
                      <span className="block text-xs text-muted-foreground">
                        Due {maintenanceDate(item.dueAt)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        className="underline"
                        href={`/maintenance/work-orders/${item.id}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {data.items.map((item) => (
              <article
                className="min-w-0 rounded-xl border bg-card p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    className="font-bold underline underline-offset-4"
                    href={`/maintenance/work-orders/${item.id}`}
                  >
                    {item.workOrderNumber}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge(item.status)}`}
                  >
                    {humanizeMaintenance(item.status)}
                  </span>
                </div>
                <h2 className="mt-3 font-semibold">{item.productName}</h2>
                <p className="text-sm text-muted-foreground">{item.title}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Priority</dt>
                    <dd>{humanizeMaintenance(item.priority)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>{item.assetNumber ?? `${item.quantity} bulk`}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assigned</dt>
                    <dd>
                      {item.assignedStaff
                        ? `${item.assignedStaff.firstName} ${item.assignedStaff.lastName}`
                        : 'Unassigned'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Due</dt>
                    <dd>{maintenanceDate(item.dueAt)}</dd>
                  </div>
                </dl>
                {item.overdue ? (
                  <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-destructive">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />{' '}
                    Overdue
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
      {data && data.meta.totalPages > 1 ? (
        <nav
          aria-label="Work-order pages"
          className="flex items-center justify-between gap-3"
        >
          <button
            className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <button
            className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50"
            disabled={page >= data.meta.totalPages}
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
