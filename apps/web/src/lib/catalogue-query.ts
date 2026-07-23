export const CATALOGUE_PAGE_SIZE = 12;

export const catalogueSorts = [
  'featured',
  'name-asc',
  'name-desc',
  'newest',
] as const;

export type CatalogueSort = (typeof catalogueSorts)[number];

export interface CatalogueQueryState {
  featured: boolean;
  page: number;
  search: string;
  sort: CatalogueSort;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCatalogueQuery(params: SearchParams): CatalogueQueryState {
  const rawPage = first(params.page);
  const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const rawSort = first(params.sort);
  return {
    featured: first(params.featured) === 'true',
    page:
      Number.isSafeInteger(parsedPage) &&
      parsedPage >= 1 &&
      parsedPage <= 10_000
        ? parsedPage
        : 1,
    search: (first(params.search) ?? '').trim().slice(0, 100),
    sort: catalogueSorts.includes(rawSort as CatalogueSort)
      ? (rawSort as CatalogueSort)
      : 'featured',
  };
}

export function catalogueApiQuery(
  state: CatalogueQueryState,
  categorySlug?: string,
): string {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(CATALOGUE_PAGE_SIZE),
    sort: state.sort,
  });
  if (categorySlug) params.set('categorySlug', categorySlug);
  if (state.search) params.set('search', state.search);
  if (state.featured) params.set('isFeatured', 'true');
  return `?${params.toString()}`;
}

export function catalogueHref(
  basePath: string,
  state: CatalogueQueryState,
  page = state.page,
): string {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.featured) params.set('featured', 'true');
  if (state.sort !== 'featured') params.set('sort', state.sort);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
