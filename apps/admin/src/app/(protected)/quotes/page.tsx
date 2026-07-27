import { QuoteList } from '@/components/quote-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function QuotesPage() {
  await requireStaffPermission('quote.view');
  return <QuoteList />;
}
