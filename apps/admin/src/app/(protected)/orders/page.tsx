import { RentalOrderList } from '@/components/rental-order-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalOrdersPage() {
  const user = await requireStaffPermission('order.view');
  return (
    <RentalOrderList
      canViewReservations={user.permissionKeys.includes(
        'inventory.reservation.view',
      )}
    />
  );
}
