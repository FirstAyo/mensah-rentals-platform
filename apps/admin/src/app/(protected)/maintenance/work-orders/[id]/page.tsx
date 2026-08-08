import { MaintenanceWorkOrderDetailView } from '@/components/maintenance-work-order-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function MaintenanceWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('maintenance.view');
  return (
    <MaintenanceWorkOrderDetailView
      id={(await params).id}
      permissions={user.permissionKeys}
    />
  );
}
