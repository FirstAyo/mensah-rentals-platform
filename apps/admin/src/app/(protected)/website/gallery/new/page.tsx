import { GalleryProjectEditor } from '@/components/gallery-project-editor';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function NewGalleryProjectPage() {
  const user = await requireStaffPermission('gallery.edit');
  return (
    <GalleryProjectEditor
      canEdit
      canManageMedia={user.permissionKeys.includes('homepage.media.manage')}
      canPreview={user.permissionKeys.includes('gallery.preview')}
      canPublish={user.permissionKeys.includes('gallery.publish')}
    />
  );
}
