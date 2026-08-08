import { ReportView } from '@/components/report-view';
import { requireStaffPermissions } from '@/lib/auth-server';
import { availableReportKeys } from '@/lib/reporting-types';

export default async function RentalsReturnsReportPage() {
  const user = await requireStaffPermissions(
    'report.view',
    'active_rental.view',
    'return.view',
    'rental_issue.view',
  );
  return (
    <ReportView
      availableReportKeys={availableReportKeys(user.permissionKeys)}
      canExport={user.permissionKeys.includes('report.export')}
      canViewAudit={user.permissionKeys.includes('audit_log.view')}
      reportKey="rentals-returns"
    />
  );
}
