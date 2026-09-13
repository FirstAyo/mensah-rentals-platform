import { GalleryProjectList } from '@/components/gallery-project-list';
import { requireStaffPermission } from '@/lib/auth-server';

export default async function GalleryProjectsPage() {
  const user = await requireStaffPermission('gallery.view');
  return (
    <GalleryProjectList
      canEdit={user.permissionKeys.includes('gallery.edit')}
    />
  );
}
