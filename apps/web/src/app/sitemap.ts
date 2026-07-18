import type { MetadataRoute } from 'next';
import { listCategories, listProducts } from '@/lib/public-catalogue';
import { siteOrigin } from '@/lib/site-config';
export const dynamic = 'force-dynamic';

async function allPages<T>(
  loader: (page: number) => Promise<{
    items: T[];
    meta: { totalPages: number };
  }>,
) {
  const first = await loader(1);
  const items = [...first.items];
  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    items.push(...(await loader(page)).items);
  }
  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const [categories, products] = await Promise.all([
    allPages((page) => listCategories(`?page=${page}&pageSize=100`)),
    allPages((page) => listProducts(`?page=${page}&pageSize=100`)),
  ]);
  return [
    { url: origin },
    { url: `${origin}/rentals` },
    ...categories.map((category) => ({
      url: `${origin}/rentals/${category.slug}`,
    })),
    ...products.map((product) => ({
      url: `${origin}/rentals/${product.category.slug}/${product.slug}`,
    })),
  ];
}
