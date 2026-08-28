import { ReportView } from '@/components/report-view';
import { requireStaffPermission } from '@/lib/auth-server';
import { availableReportKeys } from '@/lib/reporting-types';
import { requireAdminFeature } from '@/lib/feature-settings-server';
import { FeatureDisabled } from '@/components/feature-disabled';

export default async function ReportsPage() {
  const user = await requireStaffPermission('report.view');
  const { available } = await requireAdminFeature('OPERATIONAL_REPORTING');
  if (!available) return <FeatureDisabled label="Operational Reporting" />;
  return (
    <ReportView
      availableReportKeys={availableReportKeys(user.permissionKeys)}
      canExport={user.permissionKeys.includes('report.export')}
      canViewAudit={user.permissionKeys.includes('audit_log.view')}
      reportKey="overview"
    />
  );
}
