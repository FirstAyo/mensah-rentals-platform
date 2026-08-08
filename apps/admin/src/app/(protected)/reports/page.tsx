import { ReportView } from '@/components/report-view';
import { requireStaffPermission } from '@/lib/auth-server';
import { availableReportKeys } from '@/lib/reporting-types';

export default async function ReportsPage() {
  const user = await requireStaffPermission('report.view');
  return (
    <ReportView
      availableReportKeys={availableReportKeys(user.permissionKeys)}
      canExport={user.permissionKeys.includes('report.export')}
      canViewAudit={user.permissionKeys.includes('audit_log.view')}
      reportKey="overview"
    />
  );
}
