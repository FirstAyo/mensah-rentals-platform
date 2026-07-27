import { QuoteDetail } from '@/components/quote-detail';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('quote.view');
  return (
    <QuoteDetail
      canSend={user.permissionKeys.includes('quote.send')}
      canUpdate={user.permissionKeys.includes('quote.update')}
      id={(await params).id}
    />
  );
}
