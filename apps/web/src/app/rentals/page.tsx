import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { redirect } from 'next/navigation';
import { CatalogueFilters } from '@/components/catalogue-filters';
import { CataloguePagination } from '@/components/catalogue-pagination';
import { ProductCard } from '@/components/product-card';
import {
  catalogueApiQuery,
  catalogueHref,
  parseCatalogueQuery,
} from '@/lib/catalogue-query';
import { listCategories, listProducts } from '@/lib/public-catalogue';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const state = parseCatalogueQuery(await searchParams);
  const filtered =
    state.featured || Boolean(state.search) || state.sort !== 'featured';
  const canonical =
    !filtered && state.page > 1 ? `/rentals?page=${state.page}` : '/rentals';
  return {
    title: 'Equipment Rentals',
    description:
      'Browse equipment available to request from Mensah Rentals for events, productions, and projects.',
    alternates: { canonical },
    openGraph: {
      title: 'Equipment Rentals | Mensah Rentals',
      description:
        'Browse equipment and prepare a rental request for a custom quote.',
      url: canonical,
    },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const state = parseCatalogueQuery(await searchParams);
  const [categories, products] = await Promise.all([
    listCategories('?page=1&pageSize=100'),
    listProducts(catalogueApiQuery(state)),
  ]);
  if (state.page > Math.max(1, products.meta.totalPages))
    redirect(
      catalogueHref('/rentals', state, Math.max(1, products.meta.totalPages)),
    );

  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Rental catalogue
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Equipment for events, productions, and projects
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
          Explore descriptive equipment information and identify what suits your
          project. Our team reviews quantities and prepares custom pricing
          privately after you share your requirements.
        </p>
      </div>

      <div className="mt-8">
        <CatalogueFilters
          basePath="/rentals"
          categories={categories.items}
          state={state}
        />
      </div>

      <section className="mt-12" aria-labelledby="products-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {products.meta.total} catalogue{' '}
              {products.meta.total === 1 ? 'item' : 'items'}
            </p>
            <h2
              className="mt-1 text-2xl font-semibold sm:text-3xl"
              id="products-title"
            >
              {state.search
                ? `Results for "${state.search}"`
                : 'Browse equipment'}
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
              <ProductCard
                key={`${product.category.slug}-${product.slug}`}
                product={product}
              />
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
              Try a broader search, remove the featured filter, or explore a
              different category.
            </p>
          </div>
        )}
        <CataloguePagination
          basePath="/rentals"
          state={state}
          totalPages={products.meta.totalPages}
        />
      </section>
    </div>
  );
}
