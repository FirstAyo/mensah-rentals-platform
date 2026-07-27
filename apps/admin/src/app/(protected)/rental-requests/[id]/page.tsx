import { RentalRequestDetail } from '@/components/rental-request-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('rental_request.view');
  const { id } = await params;
  return (
    <RentalRequestDetail
      canAssign={user.permissionKeys.includes('rental_request.assign')}
      canUpdate={user.permissionKeys.includes('rental_request.update')}
      canViewQuantity={
        user.permissionKeys.includes('inventory.view') &&
        user.permissionKeys.includes('inventory.quantity.view')
      }
      id={id}
    />
  );
}
