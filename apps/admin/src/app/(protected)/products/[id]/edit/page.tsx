import { CatalogueForm } from '@/components/catalogue-form';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaffPermission('product.update');
  const { id } = await params;
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Edit product</h1>
      <CatalogueForm id={id} resource="products" />
    </>
  );
}
