import { CatalogueList } from '@/components/catalogue-list';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function CategoriesPage() {
  const user = await requireStaffPermission('category.view');
  return (
    <CatalogueList
      canCreate={user.permissionKeys.includes('category.create')}
      canDelete={user.permissionKeys.includes('category.delete')}
      canUpdate={user.permissionKeys.includes('category.update')}
      resource="categories"
      title="Categories"
    />
  );
}
