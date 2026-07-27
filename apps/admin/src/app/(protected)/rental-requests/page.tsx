import { RentalRequestQueue } from '@/components/rental-request-queue';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function RentalRequestsPage() {
  await requireStaffPermission('rental_request.view');
  return <RentalRequestQueue />;
}
