import type { Metadata } from 'next';

import { OrderAccessExchange } from '@/components/order-access-exchange';

export const metadata: Metadata = {
  title: 'Secure Order Access',
  robots: { index: false, follow: false, nocache: true },
};

export default function OrderAccessPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <OrderAccessExchange />
    </main>
  );
}
