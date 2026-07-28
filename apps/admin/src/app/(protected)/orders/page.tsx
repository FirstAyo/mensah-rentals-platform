import { RentalOrderList } from '@/components/rental-order-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalOrdersPage() {
  await requireStaffPermission('order.view');
  return <RentalOrderList />;
}
