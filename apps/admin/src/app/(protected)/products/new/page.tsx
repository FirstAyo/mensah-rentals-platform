import { CatalogueForm } from '@/components/catalogue-form';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function NewProductPage() {
  await requireStaffPermission('product.create');
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Create product</h1>
      <CatalogueForm resource="products" />
    </>
  );
}
