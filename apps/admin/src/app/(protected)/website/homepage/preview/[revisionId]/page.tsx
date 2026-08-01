import type { Metadata } from 'next';
import { HomepagePreview } from '@/components/homepage-preview';
import { requireStaffPermission } from '@/lib/auth-server';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: 'Homepage draft preview',
};

export default async function HomepagePreviewPage({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  await requireStaffPermission('homepage.preview');
  const { revisionId } = await params;
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        Secure preview — this draft is not public or indexable.
      </div>
      <HomepagePreview revisionId={revisionId} />
    </div>
  );
}
