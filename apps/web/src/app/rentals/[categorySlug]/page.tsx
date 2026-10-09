import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { CatalogueFilters } from '@/components/catalogue-filters';
import { CataloguePagination } from '@/components/catalogue-pagination';
import { ProductCard } from '@/components/product-card';
import {
  catalogueApiQuery,
  catalogueHref,
  hasCatalogueQueryParameters,
  parseCatalogueQuery,
} from '@/lib/catalogue-query';
import {
  getCategory,
  listCategories,
  listProducts,
  PublicCatalogueNotFound,
} from '@/lib/public-catalogue';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { serializeJsonLd } from '@/lib/structured-data';
import { getPublicFeatures } from '@/lib/public-features';

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
  const [category, rawSearchParams] = await Promise.all([
    categoryOr404(categorySlug),
    searchParams,
  ]);
  const variant = hasCatalogueQueryParameters(rawSearchParams);
  const base = `/rentals/${category.slug}`;
  const canonical = base;
  const description =
    category.description ??
    `Browse ${category.name.toLowerCase()} equipment available to request from Mensah Rentals.`;
  return {
    title: `${category.name} Rentals`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${category.name} Rentals | Mensah Rentals`,
      description,
      url: canonical,
    },
    twitter: {
      card: 'summary',
      title: `${category.name} Rentals | Mensah Rentals`,
      description,
    },
    robots: publicPageRobots(!variant),
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
  const [category, categories, features] = await Promise.all([
    categoryOr404(categorySlug),
    listCategories('?page=1&pageSize=100'),
    getPublicFeatures(),
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
    <div className="public-container py-10 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd(crumbs, siteOrigin())),
        }}
        type="application/ld+json"
      />
      {category.banner ? (
        <div className="relative mt-7 min-h-[18rem] overflow-hidden rounded-[2rem] border border-border bg-muted sm:min-h-[24rem]">
          <Image
            alt={category.banner.isDecorative ? '' : category.banner.altText}
            className="object-cover"
            fill
            priority
            sizes="(max-width: 1800px) 100vw, 1800px"
            src={category.banner.url}
            style={{ objectPosition: category.banner.focalPoint }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 max-w-4xl p-6 text-white sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">
              Equipment category
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-6xl">
              {category.name}
            </h1>
            {category.description ? (
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/85 sm:text-lg">
                {category.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
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
      )}
      {category.supportingVisuals.length ? (
        <ul
          aria-label={`${category.name} highlights`}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {category.supportingVisuals.map((visual, index) => (
            <li
              className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted"
              key={`${visual.url}-${index}`}
            >
              <Image
                alt={visual.isDecorative ? '' : visual.altText}
                className="object-cover"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                src={visual.url}
                style={{ objectPosition: visual.focalPoint }}
              />
            </li>
          ))}
        </ul>
      ) : null}
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
      <aside className="mt-14 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10">
        <h2 className="text-2xl font-semibold">
          Planning a project with {category.name.toLowerCase()}?
        </h2>
        <p className="mt-3 max-w-3xl leading-7 opacity-90">
          {features.cartSubmissionsAvailable
            ? 'Add the equipment you need to your cart, then send your enquiry with project details for staff review.'
            : 'Tell our team what your project needs and we will help you plan the right equipment.'}
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-background px-5 font-semibold text-foreground"
          href={features.cartSubmissionsAvailable ? '/rentals' : '/contact'}
        >
          {features.cartSubmissionsAvailable
            ? 'Browse all equipment'
            : 'Contact our team'}
        </Link>
      </aside>
    </div>
  );
}
