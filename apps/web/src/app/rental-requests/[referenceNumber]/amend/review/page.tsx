import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Review request amendment',
  robots: { index: false, follow: false, nocache: true },
};

export default async function AmendmentReviewPage({
  params,
}: {
  params: Promise<{ referenceNumber: string }>;
}) {
  const { referenceNumber } = await params;
  redirect(`/rental-requests/${encodeURIComponent(referenceNumber)}/amend`);
}
