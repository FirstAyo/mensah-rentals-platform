import { RentalOrderDetail } from '@/components/rental-order-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('order.view');
  return (
    <RentalOrderDetail
      canManageAccess={user.permissionKeys.includes('order.update')}
      id={(await params).id}
    />
  );
}
