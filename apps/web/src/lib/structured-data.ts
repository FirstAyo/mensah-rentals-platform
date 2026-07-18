import type { PublicProductDetailResponse } from '@mensah-rentals/types';
export function productJsonLd(
  product: PublicProductDetailResponse,
  origin: string,
) {
  const path = `/rentals/${product.category.slug}/${product.slug}`;
  const image = (
    product.images.find((item) => item.isPrimary) ?? product.images[0]
  )?.url;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${origin}${path}#product`,
    url: `${origin}${path}`,
    name: product.name,
    description: product.description ?? product.shortDescription,
    category: product.category.name,
    ...(image?.startsWith('/media/') ? { image: [`${origin}${image}`] } : {}),
  };
}
