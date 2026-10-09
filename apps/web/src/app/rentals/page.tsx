import type { Metadata } from 'next';
import { ArrowRight, PackageSearch, SearchCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CatalogueFilters } from '@/components/catalogue-filters';
import { CategoryShowcase } from '@/components/category-showcase';
import { CataloguePagination } from '@/components/catalogue-pagination';
import { ProductCard } from '@/components/product-card';
import { RentalCatalogueHero } from '@/components/rental-catalogue-hero';
import {
  catalogueApiQuery,
  catalogueHref,
  hasCatalogueQueryParameters,
  parseCatalogueQuery,
} from '@/lib/catalogue-query';
import {
  listCategories,
  listCategoryShowcase,
  listProducts,
} from '@/lib/public-catalogue';
import { shuffled } from '@/lib/shuffle';
import { publicPageRobots } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const rawSearchParams = await searchParams;
  const variant = hasCatalogueQueryParameters(rawSearchParams);
  const canonical = '/rentals';
  return {
    title: 'Equipment Rentals',
    description:
      'Browse equipment available to request from Mensah Rentals for events, productions, and projects.',
    alternates: { canonical },
    openGraph: {
      title: 'Equipment for Events, Productions, and Projects | Mensah Rentals',
      description:
        'Browse equipment and send your project requirements to our team.',
      url: canonical,
    },
    twitter: {
      card: 'summary',
      title: 'Equipment for Events, Productions, and Projects | Mensah Rentals',
      description:
        'Browse equipment and send your project requirements to our team.',
    },
    robots: publicPageRobots(!variant),
  };
}

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const state = parseCatalogueQuery(await searchParams);
  const [categories, products, showcase] = await Promise.all([
    listCategories('?page=1&pageSize=100'),
    listProducts(catalogueApiQuery(state)),
    listCategoryShowcase().catch(() => []),
  ]);
  const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const orderedShowcase = shuffled(showcase, randomSeed);
  const heroSlides = orderedShowcase
    .flatMap((category) => {
      const categoryImage = category.image;
      const productImage = category.products.find(
        (product) => product.image,
      )?.image;
      const url = categoryImage?.url ?? productImage?.url;
      return url
        ? [
            {
              focalPoint: categoryImage?.focalPoint ?? 'center',
              name: category.name,
              url,
            },
          ]
        : [];
    })
    .slice(0, 5);
  if (state.page > Math.max(1, products.meta.totalPages))
    redirect(
      catalogueHref('/rentals', state, Math.max(1, products.meta.totalPages)),
    );

  return (
    <div>
      <RentalCatalogueHero slides={heroSlides} />

      {orderedShowcase.length ? (
        <CategoryShowcase
          categories={orderedShowcase}
          description="Browse by collection and discover equipment selected from each category."
          eyebrow="Explore the catalogue"
          heading="Find the right equipment by category"
          id="catalogue-categories"
        />
      ) : null}

      <div className="public-container mt-10">
        <CatalogueFilters
          basePath="/rentals"
          categories={categories.items}
          state={state}
        />
      </div>

      <section
        className="public-container mt-12"
        aria-labelledby="products-title"
      >
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

      <aside className="public-container mb-14 mt-16 flex flex-col gap-5 rounded-3xl border border-border bg-muted/45 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex max-w-3xl gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <SearchCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Can’t find what you need?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tell our team about unlisted or specialist equipment. You can also
              include additional equipment details when sending your cart
              enquiry.
            </p>
          </div>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
          href="/contact"
        >
          Contact our team
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </aside>
    </div>
  );
}
