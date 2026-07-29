import { ActiveRentalDetail } from '@/components/active-rental-detail';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function ActiveRentalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission('active_rental.view');
  return <ActiveRentalDetail id={(await params).id} />;
}
