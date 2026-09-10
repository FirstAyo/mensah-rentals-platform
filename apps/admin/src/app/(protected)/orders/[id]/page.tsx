import { RentalOrderDetail } from '@/components/rental-order-detail';
import { requireStaffPermission } from '@/lib/auth-server';
import { getAdminFeatureAvailability } from '@/lib/feature-settings-server';

export default async function RentalOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('order.view');
  const permissions = new Set(user.permissionKeys);
  const availability = await getAdminFeatureAvailability();
  const featureAvailable = (key: 'RESERVATIONS' | 'FULFILMENT' | 'RETURNS') =>
    availability.features.some(
      (feature) => feature.key === key && feature.available,
    );
  return (
    <RentalOrderDetail
      canManageAccess={user.permissionKeys.includes('order.update')}
      currentUserId={user.id}
      id={(await params).id}
      reservationPermissions={{
        canComplete: permissions.has('inventory.reservation.update'),
        canCreate: permissions.has('inventory.reservation.create'),
        canOverride: permissions.has('inventory.reservation.override'),
        canRelease: permissions.has('inventory.reservation.release'),
        canViewAvailability: permissions.has('inventory.availability.view'),
        canViewReservation: permissions.has('inventory.reservation.view'),
      }}
      fulfilmentPermissions={{
        canView: permissions.has('fulfilment.view'),
        canPrepare: permissions.has('fulfilment.prepare'),
        canCheckout: permissions.has('fulfilment.checkout'),
        canPartialCheckout: permissions.has('fulfilment.partial_checkout'),
        canHandoff: permissions.has('fulfilment.handoff'),
        canPdf: permissions.has('fulfilment.pdf'),
        canViewReturn: permissions.has('return.view'),
      }}
      workflowFeatures={{
        fulfilment: featureAvailable('FULFILMENT'),
        reservations: featureAvailable('RESERVATIONS'),
        returns: featureAvailable('RETURNS'),
      }}
    />
  );
}
