import { InspectionList } from '@/components/inspection-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function InspectionsPage() {
  const user = await requireStaffPermission('inspection.view');
  return (
    <InspectionList
      canCreate={user.permissionKeys.includes('inspection.create')}
    />
  );
}
