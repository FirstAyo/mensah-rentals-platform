'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  EquipmentInspectionSummary,
  MaintenancePagination,
  MaintenanceWorkOrderSummary,
} from '@/lib/maintenance-types';
import { humanizeMaintenance, maintenanceDate } from '@/lib/maintenance-types';

export function InventoryMaintenanceLinks({
  inventoryId,
  canViewMaintenance,
  canViewInspections,
}: {
  inventoryId: string;
  canViewMaintenance: boolean;
  canViewInspections: boolean;
}) {
  const [work, setWork] = useState<MaintenanceWorkOrderSummary[]>([]);
  const [inspections, setInspections] = useState<EquipmentInspectionSummary[]>(
    [],
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    const requests: Promise<void>[] = [];
    if (canViewMaintenance)
      requests.push(
        fetch(
          `/api/maintenance/work-orders?inventoryId=${encodeURIComponent(inventoryId)}&page=1&pageSize=20`,
          { cache: 'no-store' },
        ).then(async (response) => {
          if (!response.ok) throw new Error();
          setWork(
            (
              (await response.json()) as MaintenancePagination<MaintenanceWorkOrderSummary>
            ).items,
          );
        }),
      );
    if (canViewInspections)
      requests.push(
        fetch(
          `/api/maintenance/inspections?inventoryId=${encodeURIComponent(inventoryId)}&page=1&pageSize=20`,
          { cache: 'no-store' },
        ).then(async (response) => {
          if (!response.ok) throw new Error();
          setInspections(
            (
              (await response.json()) as MaintenancePagination<EquipmentInspectionSummary>
            ).items,
          );
        }),
      );
    void Promise.all(requests).catch(() => setError(true));
  }, [canViewInspections, canViewMaintenance, inventoryId]);
  if (!canViewMaintenance && !canViewInspections) return null;
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Maintenance and inspections</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Internal operational records for this equipment.
      </p>
      {error ? (
        <p className="mt-3 text-sm" role="alert">
          Maintenance relationships could not be loaded.
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {canViewMaintenance ? (
          <div>
            <h3 className="font-semibold">Work orders</h3>
            {work.length ? (
              <div className="mt-2 space-y-2">
                {work.map((item) => (
                  <Link
                    className="block rounded-lg border p-3 hover:bg-muted/40"
                    href={`/maintenance/work-orders/${item.id}`}
                    key={item.id}
                  >
                    <strong>{item.workOrderNumber}</strong>
                    <span className="block text-sm text-muted-foreground">
                      {humanizeMaintenance(item.status)} ·{' '}
                      {item.assetNumber ?? `${item.quantity} bulk`}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No matching work orders.
              </p>
            )}
          </div>
        ) : null}
        {canViewInspections ? (
          <div>
            <h3 className="font-semibold">Inspections</h3>
            {inspections.length ? (
              <div className="mt-2 space-y-2">
                {inspections.map((item) => (
                  <Link
                    className="block rounded-lg border p-3 hover:bg-muted/40"
                    href={`/maintenance/inspections/${item.id}`}
                    key={item.id}
                  >
                    <strong>{item.inspectionNumber}</strong>
                    <span className="block text-sm text-muted-foreground">
                      {humanizeMaintenance(item.status)} ·{' '}
                      {maintenanceDate(item.scheduledFor)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No matching inspections.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
