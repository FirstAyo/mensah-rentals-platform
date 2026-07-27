import type { Metadata } from 'next';
import { QuoteAccessExchange } from '@/components/quote-access-exchange';

export const metadata: Metadata = {
  title: 'Secure Quote Access',
  robots: { index: false, follow: false, nocache: true },
};
export default function QuoteAccessPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <QuoteAccessExchange />
    </main>
  );
}
