import { redirect } from 'next/navigation';

export default async function AmendmentReviewPage({
  params,
}: {
  params: Promise<{ referenceNumber: string }>;
}) {
  const { referenceNumber } = await params;
  redirect(`/rental-requests/${encodeURIComponent(referenceNumber)}/amend`);
}
