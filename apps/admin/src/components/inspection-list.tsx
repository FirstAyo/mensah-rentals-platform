'use client';

import { AlertTriangle, ClipboardCheck, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  EquipmentInspectionSummary,
  MaintenanceAssignee,
  MaintenancePagination,
} from '@/lib/maintenance-types';
import {
  humanizeMaintenance,
  maintenanceDate,
  maintenanceStaffItems,
} from '@/lib/maintenance-types';
import { MaintenanceNavigation } from './maintenance-navigation';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring';

export function InspectionList({ canCreate }: { canCreate: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [staff, setStaff] = useState<MaintenanceAssignee[]>([]);
  const [data, setData] =
    useState<MaintenancePagination<EquipmentInspectionSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void fetch('/api/maintenance/staff?pageSize=100', {
      cache: 'no-store',
    }).then(async (response) => {
      if (response.ok) setStaff(maintenanceStaffItems(await response.json()));
    });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      sortBy: 'scheduledFor',
      sortDirection: 'asc',
    });
    if (search.trim()) query.set('search', search.trim());
    if (status) query.set('status', status);
    if (type) query.set('type', type);
    if (assignedToUserId) query.set('assignedToUserId', assignedToUserId);
    if (overdue) query.set('overdue', 'true');
    setLoading(true);
    setError(null);
    void fetch(`/api/maintenance/inspections?${query}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Inspections could not be loaded.');
        setData(
          (await response.json()) as MaintenancePagination<EquipmentInspectionSummary>,
        );
      })
      .catch((value) => {
        if (!(value instanceof DOMException && value.name === 'AbortError'))
          setError(
            value instanceof Error
              ? value.message
              : 'Inspections could not be loaded.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [assignedToUserId, overdue, page, search, status, type]);
  const reset = () => setPage(1);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Equipment assurance
          </p>
          <h1 className="mt-2 text-3xl font-bold">Equipment inspections</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Schedule routine checks and record post-maintenance results.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/maintenance/inspections/new"
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> Schedule inspection
          </Link>
        ) : null}
      </header>
      <MaintenanceNavigation canViewInspections />
      <section
        aria-label="Inspection filters"
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search inspections</span>
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
            placeholder="Inspection, equipment or asset"
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
            {['SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED'].map(
              (value) => (
                <option key={value} value={value}>
                  {humanizeMaintenance(value)}
                </option>
              ),
            )}
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
            <option value="ROUTINE">Routine</option>
            <option value="POST_MAINTENANCE">Post-maintenance</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Assigned staff</span>
          <select
            className={field}
            onChange={(event) => {
              setAssignedToUserId(event.target.value);
              reset();
            }}
            value={assignedToUserId}
          >
            <option value="">All assigned staff</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
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
        <p className="rounded-xl border bg-card p-8" aria-live="polite">
          Loading inspections…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border bg-card p-6" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && data?.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <ClipboardCheck
            aria-hidden="true"
            className="mx-auto h-8 w-8 text-muted-foreground"
          />
          <p className="mt-3 font-semibold">No matching inspections</p>
        </div>
      ) : null}
      {data?.items.length ? (
        <div className="grid gap-3">
          {data.items.map((item) => (
            <Link
              className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto]"
              href={`/maintenance/inspections/${item.id}`}
              key={item.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{item.inspectionNumber}</strong>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                    {humanizeMaintenance(item.status)}
                  </span>
                  {item.overdue ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />{' '}
                      Overdue
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 font-medium">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.assetNumber ??
                    `${item.quantity} bulk unit${item.quantity === 1 ? '' : 's'}`}{' '}
                  · {humanizeMaintenance(item.type)}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p>{maintenanceDate(item.scheduledFor)}</p>
                <p className="text-muted-foreground">
                  {item.assignedStaff
                    ? `${item.assignedStaff.firstName} ${item.assignedStaff.lastName}`
                    : 'Unassigned'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
      {data && data.meta.totalPages > 1 ? (
        <nav
          aria-label="Inspection pages"
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
