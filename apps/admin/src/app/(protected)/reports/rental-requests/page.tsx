import { ReportView } from '@/components/report-view';
import { requireStaffPermissions } from '@/lib/auth-server';
import { availableReportKeys } from '@/lib/reporting-types';

export default async function RentalRequestReportPage() {
  const user = await requireStaffPermissions(
    'report.view',
    'rental_request.view',
  );
  return (
    <ReportView
      availableReportKeys={availableReportKeys(user.permissionKeys)}
      canExport={user.permissionKeys.includes('report.export')}
      canViewAudit={user.permissionKeys.includes('audit_log.view')}
      reportKey="rental-requests"
    />
  );
}
