import { ChangeRequestDetail } from '@/components/change-request-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('rental_change_request.view');
  const { id } = await params;
  return (
    <ChangeRequestDetail
      canReview={user.permissionKeys.includes('rental_change_request.review')}
      id={id}
    />
  );
}
