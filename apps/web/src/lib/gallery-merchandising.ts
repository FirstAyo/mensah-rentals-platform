import type { PublicProductSummaryResponse } from '@mensah-rentals/types';

export const GALLERY_PRODUCT_LIMIT = 8;

export function selectGalleryProducts(
  products: PublicProductSummaryResponse[],
  limit = GALLERY_PRODUCT_LIMIT,
) {
  if (limit <= 0) return [];

  const unique = products.filter(
    (product, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.slug === product.slug &&
          candidate.category.slug === product.category.slug,
      ) === index,
  );
  const featured = unique.filter((product) => product.isFeatured);
  const additional = unique.filter((product) => !product.isFeatured);
  const selected = featured.slice(0, limit);
  const selectedKeys = new Set(
    selected.map((product) => `${product.category.slug}/${product.slug}`),
  );
  const selectedCategories = new Set(
    selected.map((product) => product.category.slug),
  );

  const add = (product: PublicProductSummaryResponse) => {
    const key = `${product.category.slug}/${product.slug}`;
    if (selected.length >= limit || selectedKeys.has(key)) return;
    selected.push(product);
    selectedKeys.add(key);
    selectedCategories.add(product.category.slug);
  };

  for (const product of additional)
    if (!selectedCategories.has(product.category.slug)) add(product);
  for (const product of additional) add(product);

  return selected;
}
