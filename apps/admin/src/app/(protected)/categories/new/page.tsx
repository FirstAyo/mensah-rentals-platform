import { CatalogueForm } from '@/components/catalogue-form';
import { requireStaffPermission } from '@/lib/auth-server';
export default async function NewCategoryPage() {
  await requireStaffPermission('category.create');
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Create category</h1>
      <CatalogueForm resource="categories" />
    </>
  );
}
