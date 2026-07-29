import { ReturnList } from '@/components/return-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ReturnsPage() {
  await requireStaffPermission('return.view');
  return <ReturnList />;
}
