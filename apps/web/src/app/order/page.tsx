import type { Metadata } from 'next';

import { CustomerOrder } from '@/components/customer-order';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = {
  title: 'Your Confirmed Rental Order',
  description: 'Privately review your confirmed Mensah Rentals order.',
  robots: { index: false, follow: false, nocache: true },
};

export default function OrderPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <CustomerOrder />
    </main>
  );
}
