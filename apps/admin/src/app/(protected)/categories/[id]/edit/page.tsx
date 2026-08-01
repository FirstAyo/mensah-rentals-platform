import { CatalogueForm } from '@/components/catalogue-form';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaffPermission('category.update');
  const { id } = await params;
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Edit category</h1>
      <CatalogueForm
        canManageMedia={user.permissionKeys.includes('homepage.media.manage')}
        id={id}
        resource="categories"
      />
    </>
  );
}
