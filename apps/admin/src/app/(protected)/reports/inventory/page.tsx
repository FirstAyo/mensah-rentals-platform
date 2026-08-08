import { ReportView } from '@/components/report-view';
import { requireStaffPermissions } from '@/lib/auth-server';
import { availableReportKeys } from '@/lib/reporting-types';

export default async function InventoryReportPage() {
  const user = await requireStaffPermissions(
    'report.view',
    'inventory.view',
    'inventory.quantity.view',
    'inventory.transaction.view',
  );
  return (
    <ReportView
      availableReportKeys={availableReportKeys(user.permissionKeys)}
      canExport={user.permissionKeys.includes('report.export')}
      canViewAudit={user.permissionKeys.includes('audit_log.view')}
      reportKey="inventory"
    />
  );
}
