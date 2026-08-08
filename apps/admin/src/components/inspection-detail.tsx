'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { EquipmentInspectionDetail } from '@/lib/maintenance-types';
import { humanizeMaintenance, maintenanceDate } from '@/lib/maintenance-types';
import { MaintenanceNavigation } from './maintenance-navigation';
import { OperationalConfirmationDialog } from './operational-confirmation-dialog';

type Action = 'start' | 'pass' | 'fail' | 'cancel';
const copy: Record<
  Action,
  { label: string; title: string; consequence: string }
> = {
  start: {
    label: 'Start inspection',
    title: 'Start this inspection?',
    consequence:
      'The inspection will become in progress and the action will be recorded.',
  },
  pass: {
    label: 'Pass inspection',
    title: 'Record a passed inspection?',
    consequence:
      'For post-maintenance work, this may complete the linked work order and return equipment to service. The inventory transition is audited.',
  },
  fail: {
    label: 'Fail inspection',
    title: 'Record a failed inspection?',
    consequence:
      'The equipment will remain unavailable. A linked work order returns to in progress, or corrective follow-up work may be created.',
  },
  cancel: {
    label: 'Cancel inspection',
    title: 'Cancel this inspection?',
    consequence:
      'Cancellation is terminal and does not make unavailable equipment rentable.',
  },
};

export function InspectionDetailView({
  id,
  permissions,
}: {
  id: string;
  permissions: readonly string[];
}) {
  const can = (permission: string) => permissions.includes(permission);
  const [data, setData] = useState<EquipmentInspectionDetail | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/maintenance/inspections/${id}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Inspection could not be loaded.');
    setData((await response.json()) as EquipmentInspectionDetail);
  }, [id]);
  useEffect(() => {
    void load().catch((value) =>
      setMessage(
        value instanceof Error
          ? value.message
          : 'Inspection could not be loaded.',
      ),
    );
  }, [load]);
  async function submit() {
    if (!action || !data || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/maintenance/inspections/${id}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            expectedVersion: data.version,
            ...(action === 'pass' || action === 'fail'
              ? { summary: summary.trim() }
              : {}),
            ...(action === 'cancel'
              ? { cancellationReason: summary.trim() }
              : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? 'Inspection could not be updated.');
        return;
      }
      await load();
      setAction(null);
      setSummary('');
      setMessage('Inspection updated.');
    } catch {
      setMessage(
        'Inspection could not be updated. Reload before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return <p aria-live="polite">{message ?? 'Loading inspection…'}</p>;
  const available: Action[] =
    data.status === 'SCHEDULED'
      ? ['start', 'cancel']
      : data.status === 'IN_PROGRESS'
        ? ['pass', 'fail', 'cancel']
        : [];
  const visible = available.filter((item) => {
    const primary =
      item === 'cancel' ? can('inspection.cancel') : can('inspection.perform');
    const movesInventory =
      data.type === 'ROUTINE' &&
      (item === 'start' ||
        item === 'pass' ||
        (item === 'cancel' && data.ingressMoved));
    return (
      primary && (!movesInventory || can('maintenance.inventory_transition'))
    );
  });
  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm underline" href="/maintenance/inspections">
          Back to inspections
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {data.inspectionNumber}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{data.productName}</h1>
            <p className="mt-2 text-muted-foreground">
              {humanizeMaintenance(data.type)} ·{' '}
              {data.assetNumber ??
                `${data.quantity} bulk unit${data.quantity === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold">
              {humanizeMaintenance(data.status)}
            </span>
            {data.overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" /> Overdue
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <MaintenanceNavigation canViewInspections />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Inspection details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Scheduled</dt>
                <dd>{maintenanceDate(data.scheduledFor)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Assigned</dt>
                <dd>
                  {data.assignedStaff
                    ? `${data.assignedStaff.firstName} ${data.assignedStaff.lastName}`
                    : 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Started</dt>
                <dd>{maintenanceDate(data.startedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Completed</dt>
                <dd>{maintenanceDate(data.completedAt)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link
                className="inline-flex items-center gap-1 underline"
                href={`/inventory/${data.inventoryId}`}
              >
                Open inventory{' '}
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
              {data.sourceWorkOrderId ? (
                <Link
                  className="inline-flex items-center gap-1 underline"
                  href={`/maintenance/work-orders/${data.sourceWorkOrderId}`}
                >
                  Source work order{' '}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {data.generatedWorkOrderId ? (
                <Link
                  className="inline-flex items-center gap-1 underline"
                  href={`/maintenance/work-orders/${data.generatedWorkOrderId}`}
                >
                  Corrective work order{' '}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
            {data.summary ? (
              <div className="mt-5 rounded-lg border p-4">
                <h3 className="font-semibold">Result summary</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {data.summary}
                </p>
              </div>
            ) : null}
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Activity</h2>
            <ol className="mt-4 space-y-3">
              {data.operations.map((entry) => (
                <li className="border-l-2 border-border pl-4" key={entry.id}>
                  <p className="font-semibold">
                    {humanizeMaintenance(entry.type)}
                  </p>
                  <p className="mt-1 text-sm">{entry.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.actor.firstName} {entry.actor.lastName} ·{' '}
                    {maintenanceDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">Allowed actions</h2>
            {visible.length ? (
              <div className="mt-4 grid gap-2">
                {visible.map((item) => (
                  <button
                    className={`min-h-11 rounded-lg border px-4 py-2 text-left font-semibold ${item === 'fail' || item === 'cancel' ? 'text-destructive' : ''}`}
                    key={item}
                    onClick={() => {
                      setAction(item);
                      setSummary('');
                    }}
                    type="button"
                  >
                    {copy[item].label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No actions are available for your permissions and this status.
              </p>
            )}
            {action && action !== 'start' ? (
              <label className="mt-4 grid gap-2 text-sm">
                {action === 'cancel'
                  ? 'Cancellation reason'
                  : 'Inspection summary'}
                <textarea
                  className="min-h-28 rounded-lg border bg-background px-3 py-2"
                  maxLength={3000}
                  onChange={(event) => setSummary(event.target.value)}
                  required
                  value={summary}
                />
              </label>
            ) : null}
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
        confirmLabel={action ? copy[action].label : 'Confirm'}
        consequence={action ? copy[action].consequence : ''}
        onClose={() => setAction(null)}
        onConfirm={() => void submit()}
        open={
          Boolean(action) && (action === 'start' || Boolean(summary.trim()))
        }
        title={action ? copy[action].title : ''}
      />
    </div>
  );
}
