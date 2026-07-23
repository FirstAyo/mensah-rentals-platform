import 'server-only';
import type {
  PaginatedResponse,
  PublicCategoryResponse,
  PublicProductDetailResponse,
  PublicProductSummaryResponse,
} from '@mensah-rentals/types';

export class PublicCatalogueNotFound extends Error {}
const forbidden =
  /inventory|quantity|stock|onHand|available|remaining|reserved|rented|damaged|maintenance|lost|asset|serial|transaction|internal|staff|role|permission|password|token/i;
function assertSafe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key))
        throw new Error('Unsafe public catalogue response.');
      assertSafe(nested);
    }
}
function assertKeys(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid public ${label} response.`);
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Unsafe public ${label} response.`);
}

function assertCategory(value: unknown): void {
  assertKeys(value, ['description', 'name', 'slug'], 'category');
}

function assertImage(value: unknown): void {
  assertKeys(value, ['altText', 'isPrimary', 'url'], 'image');
  if (
    typeof value.url !== 'string' ||
    !value.url.startsWith('/media/products/')
  )
    throw new Error('Unsafe public image response.');
}

function assertSummary(value: unknown): void {
  assertKeys(
    value,
    [
      'category',
      'images',
      'isFeatured',
      'name',
      'rentalUnit',
      'shortDescription',
      'slug',
    ],
    'product',
  );
  assertCategory(value.category);
  if (!Array.isArray(value.images))
    throw new Error('Invalid public product response.');
  value.images.forEach(assertImage);
}

function assertPage(value: unknown, item: (entry: unknown) => void): void {
  assertKeys(value, ['items', 'meta'], 'page');
  if (!Array.isArray(value.items)) throw new Error('Invalid public page.');
  value.items.forEach(item);
  assertKeys(value.meta, ['page', 'pageSize', 'total', 'totalPages'], 'page');
}

function assertDetail(value: unknown): void {
  assertKeys(
    value,
    [
      'category',
      'description',
      'images',
      'isFeatured',
      'name',
      'relatedProducts',
      'rentalUnit',
      'shortDescription',
      'slug',
      'specifications',
    ],
    'product detail',
  );
  const summary = { ...value };
  delete summary.description;
  delete summary.relatedProducts;
  delete summary.specifications;
  assertSummary(summary);
  if (!Array.isArray(value.relatedProducts))
    throw new Error('Invalid public related-products response.');
  value.relatedProducts.forEach(assertSummary);
  if (!Array.isArray(value.specifications))
    throw new Error('Invalid public specifications response.');
  value.specifications.forEach((specification) =>
    assertKeys(specification, ['label', 'value'], 'specification'),
  );
}

async function get<T>(
  path: string,
  shape: (value: unknown) => void,
): Promise<T> {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}${path}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) throw new PublicCatalogueNotFound();
  if (!response.ok)
    throw new Error('Public catalogue is temporarily unavailable.');
  const body: unknown = await response.json();
  assertSafe(body);
  shape(body);
  return body as T;
}
export const listCategories = (query = '') =>
  get<PaginatedResponse<PublicCategoryResponse>>(
    `/public/categories${query}`,
    (value) => assertPage(value, assertCategory),
  );
export const getCategory = (slug: string) =>
  get<PublicCategoryResponse>(
    `/public/categories/${encodeURIComponent(slug)}`,
    assertCategory,
  );
export const listProducts = (query = '') =>
  get<PaginatedResponse<PublicProductSummaryResponse>>(
    `/public/products${query}`,
    (value) => assertPage(value, assertSummary),
  );
export const getProduct = (categorySlug: string, productSlug: string) =>
  get<PublicProductDetailResponse>(
    `/public/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productSlug)}`,
    assertDetail,
  );
