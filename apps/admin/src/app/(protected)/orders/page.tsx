import { RentalOrderList } from '@/components/rental-order-list';
import { requireStaffPermission } from '@/lib/auth-server';
import { getAdminFeatureAvailability } from '@/lib/feature-settings-server';

export default async function RentalOrdersPage() {
  const user = await requireStaffPermission('order.view');
  const availability = await getAdminFeatureAvailability();
  const permissions = new Set(user.permissionKeys);
  const featureAvailable = (key: 'RESERVATIONS' | 'FULFILMENT' | 'RETURNS') =>
    availability.features.some(
      (feature) => feature.key === key && feature.available,
    );
  return (
    <RentalOrderList
      canUpdateAssignment={user.permissionKeys.includes('order.update')}
      canViewReservations={user.permissionKeys.includes(
        'inventory.reservation.view',
      )}
      currentUserId={user.id}
      nextActionAccess={{
        fulfilmentEnabled: featureAvailable('FULFILMENT'),
        reservationsEnabled: featureAvailable('RESERVATIONS'),
        returnsEnabled: featureAvailable('RETURNS'),
        canCreateReservation: permissions.has('inventory.reservation.create'),
        canUpdateReservation: permissions.has('inventory.reservation.update'),
        canPrepare: permissions.has('fulfilment.prepare'),
        canCheckout:
          permissions.has('fulfilment.checkout') &&
          permissions.has('fulfilment.handoff'),
        canViewActiveRental: permissions.has('active_rental.view'),
        canViewReturn: permissions.has('return.view'),
      }}
    />
  );
}
