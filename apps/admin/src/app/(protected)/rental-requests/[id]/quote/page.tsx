import { QuoteEditor } from '@/components/quote-editor';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function CreateQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission('quote.create');
  await requireStaffPermission('rental_request.view');
  return <QuoteEditor requestId={(await params).id} />;
}
