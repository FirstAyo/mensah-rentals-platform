import { AuditHistory } from '@/components/audit-history';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function AuditHistoryPage() {
  const user = await requireStaffPermission('audit_log.view');
  return (
    <AuditHistory
      canExport={user.permissionKeys.includes('audit_log.export')}
    />
  );
}
