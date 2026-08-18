import type { PublicProductDetailResponse } from '@mensah-rentals/types';

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function organizationJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: 'Mensah Rentals & Services Inc.',
    url: `${origin}/`,
  };
}

export function websiteJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: 'Mensah Rentals',
    publisher: { '@id': `${origin}/#organization` },
    url: `${origin}/`,
  };
}

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
    brand: { '@id': `${origin}/#organization` },
    ...(image?.startsWith('/media/') ? { image: [`${origin}${image}`] } : {}),
  };
}
