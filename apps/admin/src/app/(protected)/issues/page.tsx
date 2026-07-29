import { IssueList } from '@/components/issue-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function IssuesPage() {
  await requireStaffPermission('rental_issue.view');
  return <IssueList />;
}
