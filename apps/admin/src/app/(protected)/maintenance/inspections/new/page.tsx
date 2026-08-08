import { InspectionForm } from '@/components/inspection-form';
import { MaintenanceNavigation } from '@/components/maintenance-navigation';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaffPermission('inspection.create');
  const value = (await searchParams).sourceWorkOrderId;
  const sourceWorkOrderId = typeof value === 'string' ? value : undefined;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Maintenance
        </p>
        <h1 className="mt-2 text-3xl font-bold">Schedule inspection</h1>
        <p className="mt-2 text-muted-foreground">
          Schedule a one-time routine or post-maintenance equipment inspection.
        </p>
      </header>
      <MaintenanceNavigation canViewInspections />
      <InspectionForm
        canAssign={user.permissionKeys.includes('maintenance.assign')}
        sourceWorkOrderId={sourceWorkOrderId}
      />
    </div>
  );
}
