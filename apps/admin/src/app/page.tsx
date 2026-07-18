import { AdminLanding } from '@/components/admin-landing';
import { requireCurrentStaffUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireCurrentStaffUser();
  return <AdminLanding user={user} />;
}
