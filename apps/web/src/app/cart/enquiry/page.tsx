import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CartEnquiryForm } from '@/components/cart-enquiry-form';
import { getPublicFeatures } from '@/lib/public-features';

export const metadata: Metadata = {
  title: 'Send a Rental Enquiry',
  description:
    'Send your equipment list and project details to Mensah Rentals.',
  alternates: { canonical: '/cart/enquiry' },
  robots: { index: false, follow: false, nocache: true },
};

export default async function CartEnquiryPage() {
  const features = await getPublicFeatures();
  if (features.customerSubmissionMode !== 'EMAIL_INQUIRY') redirect('/cart');
  return (
    <div className="public-container py-10 lg:py-14">
      <div className="mb-9 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Rental enquiry
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Tell us what your project needs
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Send your equipment list and dates to our team. We will review the
          enquiry before any quote, reservation, or order is created.
        </p>
      </div>
      <CartEnquiryForm />
    </div>
  );
}
