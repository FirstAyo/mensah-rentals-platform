import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { ProductCard } from '@/components/product-card';
import {
  getCategory,
  listProducts,
  PublicCatalogueNotFound,
} from '@/lib/public-catalogue';
import { siteOrigin } from '@/lib/site-config';
export const dynamic = 'force-dynamic';
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
}: {
  params: Promise<{ categorySlug: string }>;
}): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await categoryOr404(categorySlug);
  return {
    title: `${category.name} Rentals`,
    description:
      category.description ??
      `Browse ${category.name.toLowerCase()} equipment from Mensah Rentals.`,
    alternates: { canonical: `/rentals/${category.slug}` },
    openGraph: {
      title: `${category.name} Rentals | Mensah Rentals`,
      description:
        category.description ?? `Browse ${category.name} rental equipment.`,
      url: `/rentals/${category.slug}`,
    },
  };
}
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { categorySlug } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const category = await categoryOr404(categorySlug);
  const products = await listProducts(
    `?categorySlug=${encodeURIComponent(category.slug)}&page=${page}&pageSize=20`,
  );
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/rentals', label: 'Rentals' },
    { label: category.name },
  ];
  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs items={crumbs} />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd(crumbs, siteOrigin()),
          ).replace(/</g, '\\u003c'),
        }}
        type="application/ld+json"
      />
      <h1 className="mt-6 text-4xl font-bold">{category.name}</h1>
      {category.description ? (
        <p className="mt-4 max-w-3xl text-muted-foreground">
          {category.description}
        </p>
      ) : null}
      {products.items.length ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.items.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No active products are published in this category yet.
        </div>
      )}
      {products.meta.totalPages > 1 ? (
        <nav
          aria-label="Category pagination"
          className="mt-8 flex items-center gap-3"
        >
          {page > 1 ? (
            <a
              className="rounded-lg border border-border px-4 py-2"
              href={`/rentals/${category.slug}?page=${page - 1}`}
            >
              Previous
            </a>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {page} of {products.meta.totalPages}
          </span>
          {page < products.meta.totalPages ? (
            <a
              className="rounded-lg border border-border px-4 py-2"
              href={`/rentals/${category.slug}?page=${page + 1}`}
            >
              Next
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
