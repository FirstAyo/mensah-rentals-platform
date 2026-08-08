import { AuditDetail } from '@/components/audit-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string; source: string }>;
}) {
  await requireStaffPermission('audit_log.view');
  const { id, source } = await params;
  return <AuditDetail id={id} source={source} />;
}
