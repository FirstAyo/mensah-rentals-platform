import { GalleryProjectEditor } from '@/components/gallery-project-editor';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function GalleryProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('gallery.view');
  const { id } = await params;
  return (
    <GalleryProjectEditor
      canEdit={user.permissionKeys.includes('gallery.edit')}
      canManageMedia={user.permissionKeys.includes('homepage.media.manage')}
      canPreview={user.permissionKeys.includes('gallery.preview')}
      canPublish={user.permissionKeys.includes('gallery.publish')}
      projectId={id}
    />
  );
}
