import { ReturnDetail } from '@/components/return-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('return.view');
  return (
    <ReturnDetail
      id={(await params).id}
      canCreateMaintenance={user.permissionKeys.includes('maintenance.create')}
    />
  );
}
