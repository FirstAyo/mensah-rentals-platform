import { notFound } from 'next/navigation';

import { PublicPagePreview } from '@/components/public-page-preview';
import { requireStaffPermission } from '@/lib/auth-server';

const keys: Record<string, string> = {
  about: 'ABOUT',
  contact: 'CONTACT',
  terms: 'TERMS',
  privacy: 'PRIVACY',
};
export const metadata = { robots: { index: false, follow: false } };
export default async function PublicPagePreviewPage({
  params,
}: {
  params: Promise<{ key: string; revisionId: string }>;
}) {
  await requireStaffPermission('public_pages.view');
  const values = await params;
  const pageKey = keys[values.key];
  if (!pageKey) notFound();
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <header className="mb-6">
        <p className="text-sm font-medium text-primary">Draft preview</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Public page preview
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This private preview is not the published public page.
        </p>
      </header>
      <PublicPagePreview pageKey={pageKey} revisionId={values.revisionId} />
    </div>
  );
}
