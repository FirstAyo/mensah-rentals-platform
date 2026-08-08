'use client';

import {
  AlertTriangle,
  ClipboardCheck,
  ExternalLink,
  UserRound,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type {
  MaintenanceAssignee,
  MaintenanceWorkOrderDetail,
} from '@/lib/maintenance-types';
import {
  humanizeMaintenance,
  maintenanceDate,
  maintenanceStaffItems,
} from '@/lib/maintenance-types';
import { MaintenanceNavigation } from './maintenance-navigation';
import { OperationalConfirmationDialog } from './operational-confirmation-dialog';

type Command =
  | 'start'
  | 'waiting-for-parts'
  | 'resume'
  | 'ready-for-inspection'
  | 'complete'
  | 'cancel';

const commandCopy: Record<
  Command,
  {
    label: string;
    title: string;
    consequence: (data: MaintenanceWorkOrderDetail) => string;
  }
> = {
  start: {
    label: 'Start work',
    title: 'Start maintenance work?',
    consequence: () =>
      'This records that maintenance has started. Equipment remains unavailable.',
  },
  'waiting-for-parts': {
    label: 'Wait for parts',
    title: 'Mark as waiting for parts?',
    consequence: () =>
      'The work order remains active and overdue calculations continue.',
  },
  resume: {
    label: 'Resume work',
    title: 'Resume maintenance work?',
    consequence: () =>
      'This returns the work order to in progress. Equipment remains unavailable.',
  },
  'ready-for-inspection': {
    label: 'Ready for inspection',
    title: 'Request inspection?',
    consequence: () =>
      'The equipment remains in Maintenance until a post-maintenance inspection passes.',
  },
  complete: {
    label: 'Complete work order',
    title: 'Complete this work order?',
    consequence: (data) =>
      `Completion may return ${data.assetNumber ?? `${data.quantity} unit${data.quantity === 1 ? '' : 's'}`} from Maintenance to Rentable according to the selected outcome. This is audited.`,
  },
  cancel: {
    label: 'Cancel work order',
    title: 'Cancel this work order?',
    consequence: () =>
      'Cancellation is terminal and does not silently return unresolved equipment to service.',
  },
};

function allowed(status: MaintenanceWorkOrderDetail['status']): Command[] {
  if (status === 'OPEN' || status === 'ASSIGNED') return ['start', 'cancel'];
  if (status === 'IN_PROGRESS')
    return ['waiting-for-parts', 'ready-for-inspection', 'cancel'];
  if (status === 'WAITING_FOR_PARTS') return ['resume', 'cancel'];
  if (status === 'READY_FOR_INSPECTION') return ['complete', 'cancel'];
  return [];
}

export function MaintenanceWorkOrderDetailView({
  id,
  permissions,
}: {
  id: string;
  permissions: readonly string[];
}) {
  const can = (permission: string) => permissions.includes(permission);
  const canAssign = permissions.includes('maintenance.assign');
  const canResolveLinkedIssue =
    permissions.includes('rental_issue.resolve') &&
    permissions.includes('return.reconcile');
  const [data, setData] = useState<MaintenanceWorkOrderDetail | null>(null);
  const [staff, setStaff] = useState<MaintenanceAssignee[]>([]);
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [completionOutcome, setCompletionOutcome] =
    useState('RETURN_TO_SERVICE');
  const [priority, setPriority] = useState('NORMAL');
  const [scheduledFor, setScheduledFor] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [resolveLinkedIssue, setResolveLinkedIssue] = useState(false);
  const [linkedVersions, setLinkedVersions] = useState<{
    issue: number;
    rentalReturn: number;
  } | null>(null);
  const [command, setCommand] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/maintenance/work-orders/${id}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Work order could not be loaded.');
    const next = (await response.json()) as MaintenanceWorkOrderDetail;
    setData(next);
    setAssignedStaffId(next.assignedStaff?.id ?? '');
    setPriority(next.priority);
    setScheduledFor(next.scheduledFor?.slice(0, 16) ?? '');
    setDueAt(next.dueAt?.slice(0, 16) ?? '');
  }, [id]);
  useEffect(() => {
    void load().catch((value) =>
      setMessage(
        value instanceof Error
          ? value.message
          : 'Work order could not be loaded.',
      ),
    );
  }, [load]);
  useEffect(() => {
    if (!canAssign) return;
    void fetch('/api/maintenance/staff?pageSize=100', {
      cache: 'no-store',
    }).then(async (response) => {
      if (response.ok) setStaff(maintenanceStaffItems(await response.json()));
    });
  }, [canAssign]);
  useEffect(() => {
    if (!data?.sourceRentalIssueId || !canResolveLinkedIssue) return;
    void fetch(`/api/issues/${data.sourceRentalIssueId}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{
          returnId: string;
          version: number;
        }>;
      })
      .then(async (issue) => {
        const response = await fetch(`/api/returns/${issue.returnId}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const rentalReturn = (await response.json()) as { version: number };
        setLinkedVersions({
          issue: issue.version,
          rentalReturn: rentalReturn.version,
        });
      })
      .catch(() => setLinkedVersions(null));
  }, [canResolveLinkedIssue, data?.sourceRentalIssueId]);

  async function mutate(path: string, extra: object = {}) {
    if (!data || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/maintenance/work-orders/${id}/${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            expectedVersion: data.version,
            ...extra,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? 'The work order could not be updated.');
        return;
      }
      await load();
      setReason('');
      setNote('');
      setCommand(null);
      setMessage('Work order updated.');
    } catch {
      setMessage(
        'The work order could not be updated. Reload before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return <p aria-live="polite">{message ?? 'Loading work order…'}</p>;
  const commands = allowed(data.status).filter((item) =>
    item === 'cancel'
      ? can('maintenance.cancel')
      : item === 'complete'
        ? can('maintenance.complete') && can('maintenance.inventory_transition')
        : can('maintenance.update'),
  );
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/maintenance/work-orders">
          Back to work orders
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {data.workOrderNumber}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{data.title}</h1>
            <p className="mt-2 text-muted-foreground">
              {data.productName} ·{' '}
              {data.assetNumber ??
                `${data.quantity} bulk unit${data.quantity === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold">
              {humanizeMaintenance(data.status)}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {humanizeMaintenance(data.priority)} priority
            </span>
            {data.overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" /> Overdue
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <MaintenanceNavigation canViewInspections={can('inspection.view')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          {can('maintenance.update') &&
          !['COMPLETED', 'CANCELLED'].includes(data.status) ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-xl font-semibold">Priority and schedule</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-sm">
                  Priority
                  <select
                    className="min-h-11 rounded-lg border bg-background px-3"
                    onChange={(event) => setPriority(event.target.value)}
                    value={priority}
                  >
                    {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Scheduled for
                  <input
                    className="min-h-11 rounded-lg border bg-background px-3"
                    onChange={(event) => setScheduledFor(event.target.value)}
                    type="datetime-local"
                    value={scheduledFor}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Due by
                  <input
                    className="min-h-11 rounded-lg border bg-background px-3"
                    onChange={(event) => setDueAt(event.target.value)}
                    type="datetime-local"
                    value={dueAt}
                  />
                </label>
              </div>
              <button
                className="mt-4 min-h-11 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  void mutate('update', {
                    priority,
                    scheduledFor: scheduledFor
                      ? new Date(scheduledFor).toISOString()
                      : null,
                    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                  })
                }
                type="button"
              >
                Save priority and schedule
              </button>
            </section>
          ) : null}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Work details</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
              {data.description}
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Type / source</dt>
                <dd>
                  {humanizeMaintenance(data.type)} ·{' '}
                  {humanizeMaintenance(data.source)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Assignment</dt>
                <dd>
                  {data.assignedStaff
                    ? `${data.assignedStaff.firstName} ${data.assignedStaff.lastName}${data.assignedStaff.status === 'DISABLED' ? ' (disabled)' : ''}`
                    : 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Scheduled</dt>
                <dd>{maintenanceDate(data.scheduledFor)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Due</dt>
                <dd>{maintenanceDate(data.dueAt)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              {data.inventoryId ? (
                <Link
                  className="inline-flex items-center gap-1 underline"
                  href={`/inventory/${data.inventoryId}`}
                >
                  Open inventory{' '}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {data.sourceRentalIssueId ? (
                <Link
                  className="inline-flex items-center gap-1 underline"
                  href={`/issues/${data.sourceRentalIssueId}`}
                >
                  Source issue{' '}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </section>
          {can('maintenance.assign') &&
          !['COMPLETED', 'CANCELLED'].includes(data.status) ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <UserRound aria-hidden="true" className="h-5 w-5" /> Assignment
              </h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <label className="flex-1 text-sm">
                  Eligible active staff
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    onChange={(event) => setAssignedStaffId(event.target.value)}
                    value={assignedStaffId}
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="min-h-11 self-end rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                  disabled={
                    busy || assignedStaffId === (data.assignedStaff?.id ?? '')
                  }
                  onClick={() =>
                    void mutate(
                      assignedStaffId ? 'assign' : 'unassign',
                      assignedStaffId
                        ? { assignedStaffUserId: assignedStaffId }
                        : {},
                    )
                  }
                  type="button"
                >
                  Save assignment
                </button>
              </div>
            </section>
          ) : null}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Inspections</h2>
            {data.inspections.length ? (
              <div className="mt-3 grid gap-2">
                {data.inspections.map((inspection) => (
                  <Link
                    className="rounded-lg border p-3 hover:bg-muted/40"
                    href={`/maintenance/inspections/${inspection.id}`}
                    key={inspection.id}
                  >
                    <strong>{inspection.inspectionNumber}</strong>
                    <span className="block text-sm text-muted-foreground">
                      {humanizeMaintenance(inspection.type)} ·{' '}
                      {humanizeMaintenance(inspection.status)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No inspections linked.
              </p>
            )}
            {can('inspection.create') &&
            data.status === 'READY_FOR_INSPECTION' ? (
              <Link
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold"
                href={`/maintenance/inspections/new?sourceWorkOrderId=${data.id}`}
              >
                <ClipboardCheck aria-hidden="true" className="h-4 w-4" />{' '}
                Schedule inspection
              </Link>
            ) : null}
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Activity</h2>
            {data.operations.length ? (
              <ol className="mt-4 space-y-3">
                {data.operations.map((activity) => (
                  <li
                    className="border-l-2 border-border pl-4"
                    key={activity.id}
                  >
                    <p className="font-semibold">
                      {humanizeMaintenance(activity.type)}
                    </p>
                    {activity.summary ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {activity.summary}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activity.actor
                        ? `${activity.actor.firstName} ${activity.actor.lastName} · `
                        : ''}
                      {maintenanceDate(activity.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No activity recorded.
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Wrench aria-hidden="true" className="h-5 w-5" /> Allowed actions
            </h2>
            {commands.length ? (
              <div className="mt-4 grid gap-2">
                {commands.map((item) => (
                  <button
                    className={`min-h-11 rounded-lg border px-4 py-2 text-left font-semibold ${item === 'cancel' ? 'text-destructive' : ''}`}
                    key={item}
                    onClick={() => {
                      if (
                        (item === 'complete' || item === 'cancel') &&
                        !reason.trim()
                      ) {
                        setMessage(
                          item === 'cancel'
                            ? 'Enter a cancellation reason before continuing.'
                            : 'Enter a completion summary before continuing.',
                        );
                        return;
                      }
                      setCommand(item);
                    }}
                    type="button"
                  >
                    {commandCopy[item].label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No operational actions are available for your permissions and
                this status.
              </p>
            )}
            {commands.some(
              (item) => item === 'cancel' || item === 'complete',
            ) ? (
              <label className="mt-4 grid gap-2 text-sm">
                {command === 'cancel'
                  ? 'Cancellation reason'
                  : 'Completion summary'}
                <textarea
                  className="min-h-24 rounded-lg border bg-background px-3 py-2"
                  maxLength={2000}
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </label>
            ) : null}
            {command === 'complete' ? (
              <>
                <label className="mt-3 grid gap-2 text-sm">
                  Equipment outcome
                  <select
                    className="min-h-11 rounded-lg border bg-background px-3"
                    onChange={(event) =>
                      setCompletionOutcome(event.target.value)
                    }
                    value={completionOutcome}
                  >
                    <option value="RETURN_TO_SERVICE">Return to service</option>
                    <option value="REMAINS_DAMAGED">Remains damaged</option>
                  </select>
                </label>
                {linkedVersions && canResolveLinkedIssue ? (
                  <label className="mt-4 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      checked={resolveLinkedIssue}
                      className="h-5 w-5"
                      onChange={(event) =>
                        setResolveLinkedIssue(event.target.checked)
                      }
                      type="checkbox"
                    />{' '}
                    Resolve the linked issue as repaired when this work returns
                    to service
                  </label>
                ) : null}
              </>
            ) : null}
          </section>
          {can('maintenance.note') &&
          !['COMPLETED', 'CANCELLED'].includes(data.status) ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-xl font-semibold">Add internal note</h2>
              <label className="mt-3 grid gap-2 text-sm">
                Note
                <textarea
                  className="min-h-28 rounded-lg border bg-background px-3 py-2"
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
              <button
                className="mt-3 min-h-11 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                disabled={busy || !note.trim()}
                onClick={() => void mutate('notes', { body: note.trim() })}
                type="button"
              >
                Add note
              </button>
            </section>
          ) : null}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Internal notes</h2>
            {data.notes.length ? (
              <div className="mt-3 space-y-3">
                {data.notes.map((entry) => (
                  <article className="rounded-lg border p-3" key={entry.id}>
                    <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {entry.author.firstName} {entry.author.lastName} ·{' '}
                      {maintenanceDate(entry.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No notes recorded.
              </p>
            )}
          </section>
        </aside>
      </div>
      {message ? (
        <p className="rounded-lg border p-4 text-sm" aria-live="polite">
          {message}
        </p>
      ) : null}
      <OperationalConfirmationDialog
        busy={busy}
        confirmLabel={command ? commandCopy[command].label : 'Confirm'}
        consequence={command ? commandCopy[command].consequence(data) : ''}
        onClose={() => setCommand(null)}
        onConfirm={() => {
          if (!command) return;
          void mutate(command, {
            ...(command === 'cancel'
              ? { cancellationReason: reason.trim() }
              : {}),
            ...(command === 'complete'
              ? {
                  completionSummary: reason.trim(),
                  completionOutcome,
                  resolveLinkedIssueAsRepaired:
                    completionOutcome === 'RETURN_TO_SERVICE' &&
                    resolveLinkedIssue,
                  ...(resolveLinkedIssue && linkedVersions
                    ? {
                        expectedIssueVersion: linkedVersions.issue,
                        expectedReturnVersion: linkedVersions.rentalReturn,
                      }
                    : {}),
                }
              : {}),
          });
        }}
        open={Boolean(command)}
        title={command ? commandCopy[command].title : ''}
      />
    </div>
  );
}
