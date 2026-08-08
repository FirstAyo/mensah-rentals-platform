import { MaintenanceWorkOrderList } from '@/components/maintenance-work-order-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function MaintenanceWorkOrdersPage() {
  const user = await requireStaffPermission('maintenance.view');
  return (
    <MaintenanceWorkOrderList
      canCreate={user.permissionKeys.includes('maintenance.create')}
      canViewInspections={user.permissionKeys.includes('inspection.view')}
    />
  );
}
