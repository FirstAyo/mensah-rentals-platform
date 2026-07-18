import { CatalogueList } from '@/components/catalogue-list';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function ProductsPage() {
  const user = await requireStaffPermission('product.view');
  return (
    <CatalogueList
      canCreate={user.permissionKeys.includes('product.create')}
      canDelete={user.permissionKeys.includes('product.delete')}
      canUpdate={user.permissionKeys.includes('product.update')}
      resource="products"
      title="Products"
    />
  );
}
