import 'server-only';
import type {
  PaginatedResponse,
  PublicCategoryResponse,
  PublicProductDetailResponse,
  PublicProductSummaryResponse,
} from '@mensah-rentals/types';

export class PublicCatalogueNotFound extends Error {}
const forbidden =
  /totalQuantity|availableQuantity|remainingQuantity|reservedQuantity|rentedQuantity|damagedQuantity|maintenanceQuantity|lostQuantity|passwordHash|tokenHash/i;
function assertSafe(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key))
        throw new Error('Unsafe public catalogue response.');
      assertSafe(nested);
    }
}
async function get<T>(path: string): Promise<T> {
  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}${path}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) throw new PublicCatalogueNotFound();
  if (!response.ok)
    throw new Error('Public catalogue is temporarily unavailable.');
  const body: unknown = await response.json();
  assertSafe(body);
  return body as T;
}
export const listCategories = (query = '') =>
  get<PaginatedResponse<PublicCategoryResponse>>(`/public/categories${query}`);
export const getCategory = (slug: string) =>
  get<PublicCategoryResponse>(`/public/categories/${encodeURIComponent(slug)}`);
export const listProducts = (query = '') =>
  get<PaginatedResponse<PublicProductSummaryResponse>>(
    `/public/products${query}`,
  );
export const getProduct = (categorySlug: string, productSlug: string) =>
  get<PublicProductDetailResponse>(
    `/public/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productSlug)}`,
  );
