import { notFound } from 'next/navigation';
import type { PublicPageKey } from '@mensah-rentals/validation';

import { PublicPageEditor } from '@/components/public-page-editor';
import { requireStaffPermission } from '@/lib/auth-server';

const keys: Record<string, PublicPageKey> = {
  about: 'ABOUT',
  contact: 'CONTACT',
  terms: 'TERMS',
  privacy: 'PRIVACY',
};
export default async function PublicPageManagement({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const user = await requireStaffPermission('public_pages.view');
  const value = keys[(await params).key];
  if (!value) notFound();
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <header className="mb-6">
        <p className="text-sm font-medium text-primary">Website content</p>
        <h1 className="text-3xl font-bold tracking-tight">
          {value[0]}
          {value.slice(1).toLowerCase()} page
        </h1>
      </header>
      <PublicPageEditor
        canEdit={user.permissionKeys.includes('public_pages.edit')}
        canPublish={user.permissionKeys.includes('public_pages.publish')}
        pageKey={value}
      />
    </div>
  );
}
