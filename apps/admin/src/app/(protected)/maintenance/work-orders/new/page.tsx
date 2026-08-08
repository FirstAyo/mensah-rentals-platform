import { MaintenanceNavigation } from '@/components/maintenance-navigation';
import { MaintenanceWorkOrderForm } from '@/components/maintenance-work-order-form';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function NewMaintenanceWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaffPermission('maintenance.create');
  const query = await searchParams;
  const string = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Maintenance
        </p>
        <h1 className="mt-2 text-3xl font-bold">Create work order</h1>
        <p className="mt-2 text-muted-foreground">
          Create one auditable maintenance instruction for exact equipment.
        </p>
      </header>
      <MaintenanceNavigation
        canViewInspections={user.permissionKeys.includes('inspection.view')}
      />
      <MaintenanceWorkOrderForm
        canAssign={user.permissionKeys.includes('maintenance.assign')}
        canTransitionInventory={user.permissionKeys.includes(
          'maintenance.inventory_transition',
        )}
        source={{
          inventoryId: string(query.inventoryId),
          inventoryItemId: string(query.inventoryItemId),
          sourceRentalIssueId: string(query.sourceRentalIssueId),
          sourceRentalReturnItemId: string(query.sourceRentalReturnItemId),
        }}
      />
    </div>
  );
}
