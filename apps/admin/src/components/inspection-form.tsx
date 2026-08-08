'use client';

import type {
  AdminInventoryItemResponse,
  AdminInventoryMetadataResponse,
  PaginatedResponse,
} from '@mensah-rentals/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type {
  MaintenanceAssignee,
  MaintenanceWorkOrderDetail,
} from '@/lib/maintenance-types';
import { maintenanceStaffItems } from '@/lib/maintenance-types';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring';

export function InspectionForm({
  canAssign,
  sourceWorkOrderId,
}: {
  canAssign: boolean;
  sourceWorkOrderId?: string;
}) {
  const router = useRouter();
  const [inventories, setInventories] = useState<
    AdminInventoryMetadataResponse[]
  >([]);
  const [assets, setAssets] = useState<AdminInventoryItemResponse[]>([]);
  const [staff, setStaff] = useState<MaintenanceAssignee[]>([]);
  const [inventoryId, setInventoryId] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState(
    sourceWorkOrderId ? 'POST_MAINTENANCE' : 'ROUTINE',
  );
  const [scheduledFor, setScheduledFor] = useState('');
  const [assignedStaffUserId, setAssignedStaffUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(
    () => inventories.find((item) => item.id === inventoryId),
    [inventories, inventoryId],
  );
  useEffect(() => {
    void fetch('/api/inventory?page=1&pageSize=100', {
      cache: 'no-store',
    }).then(async (response) => {
      if (response.ok)
        setInventories(
          (
            (await response.json()) as PaginatedResponse<AdminInventoryMetadataResponse>
          ).items,
        );
    });
    if (canAssign)
      void fetch('/api/maintenance/staff?pageSize=100', {
        cache: 'no-store',
      }).then(async (response) => {
        if (response.ok) setStaff(maintenanceStaffItems(await response.json()));
      });
    if (sourceWorkOrderId)
      void fetch(`/api/maintenance/work-orders/${sourceWorkOrderId}`, {
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const work = (await response.json()) as MaintenanceWorkOrderDetail;
          setInventoryId(work.inventoryId);
          setInventoryItemId(work.inventoryItemId ?? '');
          setQuantity(work.quantity);
        })
        .catch(() => setError('The source work order could not be loaded.'));
  }, [canAssign, sourceWorkOrderId]);
  useEffect(() => {
    if (!inventoryId || selected?.trackingMode !== 'SERIALIZED') {
      setAssets([]);
      return;
    }
    void fetch(`/api/inventory/${inventoryId}/items?page=1&pageSize=100`, {
      cache: 'no-store',
    }).then(async (response) => {
      if (response.ok)
        setAssets(
          (
            (await response.json()) as PaginatedResponse<AdminInventoryItemResponse>
          ).items,
        );
    });
  }, [inventoryId, selected?.trackingMode]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/maintenance/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          type,
          inventoryId,
          inventoryItemId:
            selected?.trackingMode === 'SERIALIZED' ? inventoryItemId : null,
          quantity: selected?.trackingMode === 'BULK' ? quantity : 1,
          sourceWorkOrderId: sourceWorkOrderId ?? null,
          assignedStaffUserId: assignedStaffUserId || null,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.id) {
        setError(payload?.message ?? 'Inspection could not be scheduled.');
        return;
      }
      router.replace(`/maintenance/inspections/${payload.id}`);
    } catch {
      setError('Inspection could not be scheduled.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      <section className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Inspection details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Type
            <select
              className={field}
              disabled={Boolean(sourceWorkOrderId)}
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              <option value="ROUTINE">Routine</option>
              <option value="POST_MAINTENANCE">Post-maintenance</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            Scheduled for
            <input
              className={field}
              onChange={(event) => setScheduledFor(event.target.value)}
              required
              type="datetime-local"
              value={scheduledFor}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Equipment
            <select
              className={field}
              disabled={Boolean(sourceWorkOrderId)}
              onChange={(event) => {
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
          {selected?.trackingMode === 'SERIALIZED' ? (
            <label className="grid gap-2 text-sm">
              Exact asset
              <select
                className={field}
                disabled={Boolean(sourceWorkOrderId)}
                onChange={(event) => setInventoryItemId(event.target.value)}
                required
                value={inventoryItemId}
              >
                <option value="">Select asset</option>
                {assets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.assetNumber} · {item.status}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="grid gap-2 text-sm">
              Quantity
              <input
                className={field}
                disabled={Boolean(sourceWorkOrderId)}
                min="1"
                onChange={(event) => setQuantity(Number(event.target.value))}
                required
                type="number"
                value={quantity}
              />
            </label>
          )}
          {canAssign ? (
            <label className="grid gap-2 text-sm md:col-span-2">
              Assign to
              <select
                className={field}
                onChange={(event) => setAssignedStaffUserId(event.target.value)}
                value={assignedStaffUserId}
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
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
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
            !scheduledFor ||
            (selected?.trackingMode === 'SERIALIZED' && !inventoryItemId)
          }
          type="submit"
        >
          {busy ? 'Scheduling…' : 'Schedule inspection'}
        </button>
      </div>
    </form>
  );
}
