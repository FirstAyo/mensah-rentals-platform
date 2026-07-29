import { ActiveRentalList } from '@/components/active-rental-list';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function ActiveRentalsPage() {
  await requireStaffPermission('active_rental.view');
  return <ActiveRentalList />;
}
