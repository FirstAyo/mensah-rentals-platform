'use client';

import type {
  AdminInventoryItemResponse,
  AdminInventoryMetadataResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type {
  MaintenanceAssignee,
  MaintenanceSourceTarget,
} from '@/lib/maintenance-types';
import {
  maintenanceSourceOptions,
  maintenanceSourceQuantity,
  maintenanceStaffItems,
} from '@/lib/maintenance-types';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface SourceContext {
  inventoryId?: string;
  inventoryItemId?: string;
  sourceRentalIssueId?: string;
  sourceRentalReturnItemId?: string;
}

export function MaintenanceWorkOrderForm({
  canAssign,
  canTransitionInventory,
  source,
}: {
  canAssign: boolean;
  canTransitionInventory: boolean;
  source: SourceContext;
}) {
  const router = useRouter();
  const lockedSource = Boolean(
    source.sourceRentalIssueId || source.sourceRentalReturnItemId,
  );
  const [inventories, setInventories] = useState<
    AdminInventoryMetadataResponse[]
  >([]);
  const [assets, setAssets] = useState<AdminInventoryItemResponse[]>([]);
  const [staff, setStaff] = useState<MaintenanceAssignee[]>([]);
  const [inventoryId, setInventoryId] = useState(source.inventoryId ?? '');
  const [inventoryItemId, setInventoryItemId] = useState(
    source.inventoryItemId ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const [sourceState, setSourceState] = useState<
    'RENTABLE' | 'DAMAGED' | 'MAINTENANCE'
  >(canTransitionInventory ? 'RENTABLE' : 'MAINTENANCE');
  const [type, setType] = useState<'CORRECTIVE' | 'PREVENTIVE'>(
    lockedSource ? 'CORRECTIVE' : 'PREVENTIVE',
  );
  const [priority, setPriority] = useState('NORMAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sourceTarget, setSourceTarget] =
    useState<MaintenanceSourceTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const selected = useMemo(
    () => inventories.find((item) => item.id === inventoryId),
    [inventories, inventoryId],
  );
  const serializedSource = Boolean(
    sourceTarget?.inventoryItemId || sourceTarget?.targets?.length,
  );
  const sourceOptions = maintenanceSourceOptions(sourceTarget);
  const serializedTarget =
    selected?.trackingMode === 'SERIALIZED' || serializedSource;

  useEffect(() => {
    void fetch('/api/inventory?page=1&pageSize=100', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data =
          (await response.json()) as PaginatedResponse<AdminInventoryMetadataResponse>;
        setInventories(data.items);
      })
      .catch(() => setError('Equipment options could not be loaded.'));
    if (canAssign)
      void fetch('/api/maintenance/staff?pageSize=100', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          setStaff(maintenanceStaffItems(await response.json()));
        })
        .catch(() => setError('Eligible staff options could not be loaded.'));
  }, [canAssign]);

  useEffect(() => {
    const sourcePath = source.sourceRentalIssueId
      ? `issues/${source.sourceRentalIssueId}`
      : source.sourceRentalReturnItemId
        ? `return-items/${source.sourceRentalReturnItemId}`
        : null;
    if (!sourcePath) return;
    void fetch(`/api/maintenance/sources/${sourcePath}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('The maintenance source is unavailable.');
        const target = (await response.json()) as MaintenanceSourceTarget;
        setSourceTarget(target);
        setInventoryId(target.inventoryId);
        setInventoryItemId(target.inventoryItemId ?? '');
        setQuantity(maintenanceSourceQuantity(target));
        if (target.inventoryItemId) setInventoryItemId(target.inventoryItemId);
      })
      .catch((value) =>
        setError(
          value instanceof Error
            ? value.message
            : 'The maintenance source is unavailable.',
        ),
      );
  }, [source.sourceRentalIssueId, source.sourceRentalReturnItemId]);

  useEffect(() => {
    if (!inventoryId || selected?.trackingMode !== 'SERIALIZED') {
      setAssets([]);
      return;
    }
    void fetch(`/api/inventory/${inventoryId}/items?page=1&pageSize=100`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data =
          (await response.json()) as PaginatedResponse<AdminInventoryItemResponse>;
        setAssets(
          data.items.filter(
            (item) =>
              item.status === 'RENTABLE' ||
              item.status === 'DAMAGED' ||
              item.status === 'MAINTENANCE',
          ),
        );
      })
      .catch(() => setError('Serialized asset options could not be loaded.'));
  }, [inventoryId, selected?.trackingMode]);

  function newIntent() {
    setOperationId(crypto.randomUUID());
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          source: source.sourceRentalIssueId
            ? 'RETURN_ISSUE'
            : source.sourceRentalReturnItemId
              ? 'RETURN_DISPOSITION'
              : 'MANUAL',
          sourceRentalIssueId: source.sourceRentalIssueId,
          sourceRentalReturnItemId: source.sourceRentalReturnItemId,
          inventoryId,
          inventoryItemId: serializedTarget ? inventoryItemId : null,
          sourceState: lockedSource ? undefined : sourceState,
          quantity: serializedTarget ? 1 : quantity,
          type,
          priority,
          title: title.trim(),
          description: description.trim(),
          assignedStaffUserId: assignedStaffId || undefined,
          scheduledFor: scheduledFor
            ? new Date(scheduledFor).toISOString()
            : undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.id) {
        setError(payload?.message ?? 'Work order could not be created.');
        return;
      }
      router.replace(`/maintenance/work-orders/${payload.id}`);
    } catch {
      setError(
        'Work order could not be created. Retry to safely reuse this attempt.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      {lockedSource ? (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <p>
            This work order will be linked downstream to the selected return or
            issue. The original return and issue history will not be changed.
          </p>
        </div>
      ) : null}
      <section
        className="rounded-xl border bg-card p-4 sm:p-6"
        aria-labelledby="target-heading"
      >
        <h2 className="text-xl font-semibold" id="target-heading">
          Equipment target
        </h2>
        {sourceTarget ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <p className="font-semibold">{sourceTarget.productName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sourceTarget.assetNumber ??
                (sourceTarget.targets?.length
                  ? `${sourceTarget.targets.length} eligible returned assets`
                  : `${sourceTarget.quantityAvailable ?? 0} eligible bulk unit${sourceTarget.quantityAvailable === 1 ? '' : 's'}`)}
            </p>
            {!sourceTarget.eligible ? (
              <p className="mt-2 font-semibold text-destructive">
                This source no longer has eligible maintenance equipment.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Equipment
            <select
              className={field}
              disabled={Boolean(source.inventoryId) || lockedSource}
              onChange={(event) => {
                newIntent();
                setInventoryId(event.target.value);
                setInventoryItemId('');
              }}
              required
              value={inventoryId}
            >
              <option value="">Select equipment</option>
              {inventories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product.name} · {item.trackingMode}
                </option>
              ))}
            </select>
          </label>
          {serializedTarget ? (
            <label className="grid gap-2 text-sm">
              Serialized asset
              <select
                className={field}
                disabled={
                  Boolean(source.inventoryItemId) ||
                  Boolean(
                    sourceTarget?.inventoryItemId &&
                      !sourceTarget.targets?.length,
                  )
                }
                onChange={(event) => {
                  newIntent();
                  setInventoryItemId(event.target.value);
                }}
                required
                value={inventoryItemId}
              >
                <option value="">Select exact asset</option>
                {(sourceOptions.length ? sourceOptions : assets).map((item) => {
                  const itemId =
                    'inventoryItemId' in item ? item.inventoryItemId : item.id;
                  return (
                    <option key={itemId} value={itemId}>
                      {item.assetNumber}
                      {item.serialNumber ? ` · ${item.serialNumber}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : (
            <>
              <label className="grid gap-2 text-sm">
                Maintenance quantity
                <input
                  className={field}
                  disabled={lockedSource}
                  min="1"
                  onChange={(event) => {
                    newIntent();
                    setQuantity(Number(event.target.value));
                  }}
                  required
                  type="number"
                  value={quantity}
                />
              </label>
              {!lockedSource ? (
                <label className="grid gap-2 text-sm">
                  Current inventory state
                  <select
                    className={field}
                    onChange={(event) => {
                      newIntent();
                      setSourceState(event.target.value as typeof sourceState);
                    }}
                    value={sourceState}
                  >
                    <option disabled={!canTransitionInventory} value="RENTABLE">
                      Rentable
                    </option>
                    <option disabled={!canTransitionInventory} value="DAMAGED">
                      Damaged
                    </option>
                    <option value="MAINTENANCE">Already in maintenance</option>
                  </select>
                </label>
              ) : null}
            </>
          )}
        </div>
      </section>
      <section
        className="rounded-xl border bg-card p-4 sm:p-6"
        aria-labelledby="details-heading"
      >
        <h2 className="text-xl font-semibold" id="details-heading">
          Work details
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Type
            <select
              className={field}
              onChange={(event) => {
                newIntent();
                setType(event.target.value as typeof type);
              }}
              value={type}
            >
              <option value="CORRECTIVE">Corrective</option>
              <option value="PREVENTIVE">Preventive</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            Priority
            <select
              className={field}
              onChange={(event) => {
                newIntent();
                setPriority(event.target.value);
              }}
              value={priority}
            >
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            Title
            <input
              className={field}
              maxLength={160}
              onChange={(event) => {
                newIntent();
                setTitle(event.target.value);
              }}
              required
              value={title}
            />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            Description
            <textarea
              className={`${field} min-h-28`}
              maxLength={4000}
              onChange={(event) => {
                newIntent();
                setDescription(event.target.value);
              }}
              required
              value={description}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Scheduled for
            <input
              className={field}
              onChange={(event) => {
                newIntent();
                setScheduledFor(event.target.value);
              }}
              type="datetime-local"
              value={scheduledFor}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Due by
            <input
              className={field}
              onChange={(event) => {
                newIntent();
                setDueAt(event.target.value);
              }}
              type="datetime-local"
              value={dueAt}
            />
          </label>
          {canAssign ? (
            <label className="grid gap-2 text-sm md:col-span-2">
              Assign to
              <select
                className={field}
                onChange={(event) => {
                  newIntent();
                  setAssignedStaffId(event.target.value);
                }}
                value={assignedStaffId}
              >
                <option value="">Leave unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
          disabled={
            busy ||
            !inventoryId ||
            !title.trim() ||
            !description.trim() ||
            (serializedTarget && !inventoryItemId) ||
            sourceTarget?.eligible === false
          }
          type="submit"
        >
          {busy ? 'Creating…' : 'Create work order'}
        </button>
      </div>
    </form>
  );
}
