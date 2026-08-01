import { HomepageEditor } from '@/components/homepage-editor';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function HomepageContentPage() {
  const user = await requireStaffPermission('homepage.view');
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <header className="mb-6">
        <p className="text-sm font-medium text-primary">Website content</p>
        <h1 className="text-3xl font-bold tracking-tight">Homepage</h1>
      </header>
      <HomepageEditor
        canEdit={user.permissionKeys.includes('homepage.edit')}
        canManageMedia={user.permissionKeys.includes('homepage.media.manage')}
        canPreview={user.permissionKeys.includes('homepage.preview')}
        canPublish={user.permissionKeys.includes('homepage.publish')}
      />
    </div>
  );
}
