import { InspectionDetailView } from '@/components/inspection-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('inspection.view');
  return (
    <InspectionDetailView
      id={(await params).id}
      permissions={user.permissionKeys}
    />
  );
}
