import { ReturnDetail } from '@/components/return-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission('return.view');
  return <ReturnDetail id={(await params).id} />;
}
