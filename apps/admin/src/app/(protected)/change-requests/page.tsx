import { ChangeRequestList } from '@/components/change-request-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ChangeRequestsPage() {
  await requireStaffPermission('rental_change_request.view');
  return <ChangeRequestList />;
}
