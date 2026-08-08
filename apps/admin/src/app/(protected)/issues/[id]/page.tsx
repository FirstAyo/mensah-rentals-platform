import { IssueDetail } from '@/components/issue-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('rental_issue.view');
  return (
    <IssueDetail
      id={(await params).id}
      canCreateMaintenance={user.permissionKeys.includes('maintenance.create')}
    />
  );
}
