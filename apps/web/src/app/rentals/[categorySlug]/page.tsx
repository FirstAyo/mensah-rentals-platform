import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { CatalogueFilters } from '@/components/catalogue-filters';
import { CataloguePagination } from '@/components/catalogue-pagination';
import { ProductCard } from '@/components/product-card';
import {
  catalogueApiQuery,
  catalogueHref,
  parseCatalogueQuery,
} from '@/lib/catalogue-query';
import {
  getCategory,
  listCategories,
  listProducts,
  PublicCatalogueNotFound,
} from '@/lib/public-catalogue';
import { siteOrigin } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
type Params = Record<string, string | string[] | undefined>;

async function categoryOr404(slug: string) {
  try {
    return await getCategory(slug);
  } catch (error) {
    if (error instanceof PublicCatalogueNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const { categorySlug } = await params;
  const [category, state] = await Promise.all([
    categoryOr404(categorySlug),
    searchParams.then(parseCatalogueQuery),
  ]);
  const filtered =
    state.featured || Boolean(state.search) || state.sort !== 'featured';
  const base = `/rentals/${category.slug}`;
  const canonical =
    !filtered && state.page > 1 ? `${base}?page=${state.page}` : base;
  return {
    title: `${category.name} Rentals`,
    description:
      category.description ??
      `Browse ${category.name.toLowerCase()} equipment from Mensah Rentals.`,
    alternates: { canonical },
    openGraph: {
      title: `${category.name} Rentals | Mensah Rentals`,
      description:
        category.description ?? `Browse ${category.name} rental equipment.`,
      url: canonical,
    },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Params>;
}) {
  const { categorySlug } = await params;
  const state = parseCatalogueQuery(await searchParams);
  const [category, categories] = await Promise.all([
    categoryOr404(categorySlug),
    listCategories('?page=1&pageSize=100'),
  ]);
  const products = await listProducts(catalogueApiQuery(state, category.slug));
  const basePath = `/rentals/${category.slug}`;
  if (state.page > Math.max(1, products.meta.totalPages))
    redirect(
      catalogueHref(basePath, state, Math.max(1, products.meta.totalPages)),
    );

  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/rentals', label: 'Rentals' },
    { label: category.name },
  ];
  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd(crumbs, siteOrigin()),
          ).replace(/</g, '\\u003c'),
        }}
        type="application/ld+json"
      />
      <div className="mt-7 max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Equipment category
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
            {category.description}
          </p>
        ) : null}
      </div>
      <div className="mt-8">
        <CatalogueFilters
          basePath={basePath}
          categories={categories.items}
          currentCategory={category.slug}
          state={state}
        />
      </div>
      <section className="mt-12" aria-labelledby="category-products-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {products.meta.total} catalogue{' '}
              {products.meta.total === 1 ? 'item' : 'items'}
            </p>
            <h2
              className="mt-1 text-2xl font-semibold sm:text-3xl"
              id="category-products-title"
            >
              {state.search
                ? `Results for "${state.search}"`
                : `${category.name} equipment`}
            </h2>
          </div>
          {products.meta.totalPages > 0 ? (
            <p className="text-sm text-muted-foreground">
              Page {state.page} of {products.meta.totalPages}
            </p>
          ) : null}
        </div>
        {products.items.length ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {products.items.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <PackageSearch
              aria-hidden="true"
              className="h-10 w-10 text-primary"
            />
            <h2 className="mt-4 text-xl font-semibold">
              No matching equipment found
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Clear the filters or choose another catalogue category.
            </p>
          </div>
        )}
        <CataloguePagination
          basePath={basePath}
          state={state}
          totalPages={products.meta.totalPages}
        />
      </section>
    </div>
  );
}
