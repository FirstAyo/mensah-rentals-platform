import { RentalOrderDetail } from '@/components/rental-order-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission('order.view');
  return <RentalOrderDetail id={(await params).id} />;
}
