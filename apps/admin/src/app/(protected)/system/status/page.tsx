import { SystemStatus } from '@/components/system-status';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function SystemStatusPage() {
  const user = await requireStaffPermission('observability.view');
  return (
    <SystemStatus
      canViewBackup={user.permissionKeys.includes('backup.view_status')}
    />
  );
}
