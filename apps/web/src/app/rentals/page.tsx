import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { listCategories, listProducts } from '@/lib/public-catalogue';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Equipment Rentals',
  description:
    'Browse equipment available to request from Mensah Rentals for events, productions, and projects.',
  alternates: { canonical: '/rentals' },
  openGraph: {
    title: 'Equipment Rentals | Mensah Rentals',
    description:
      'Browse equipment and submit a rental request for a custom quote.',
    url: '/rentals',
  },
};
export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = (params.search ?? '').slice(0, 100);
  const query = `?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`;
  const [categories, products] = await Promise.all([
    listCategories('?page=1&pageSize=100'),
    listProducts(query),
  ]);
  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        Rental catalogue
      </p>
      <h1 className="mt-2 text-4xl font-bold">Equipment rentals</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">
        Choose what suits your project. Quantities and final pricing are
        reviewed privately by our team after a request is submitted.
      </p>
      <form className="mt-8 flex max-w-xl gap-2">
        <label className="sr-only" htmlFor="catalogue-search">
          Search rentals
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3"
          defaultValue={search}
          id="catalogue-search"
          name="search"
          placeholder="Search equipment"
        />
        <button className="rounded-lg bg-primary px-5 py-3 font-semibold text-white">
          Search
        </button>
      </form>
      <section className="mt-10" aria-labelledby="categories-title">
        <h2 className="text-2xl font-semibold" id="categories-title">
          Categories
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.items.map((category) => (
            <Link
              className="rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted"
              href={`/rentals/${category.slug}`}
              key={category.slug}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-12" aria-labelledby="products-title">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold" id="products-title">
            {search ? `Results for “${search}”` : 'Browse equipment'}
          </h2>
          <span className="text-sm text-muted-foreground">
            {products.meta.total} catalogue items
          </span>
        </div>
        {products.items.length ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {products.items.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No catalogue items match this search.
          </div>
        )}
        {products.meta.totalPages > 1 ? (
          <nav
            aria-label="Catalogue pagination"
            className="mt-8 flex items-center gap-3"
          >
            {page > 1 ? (
              <Link
                className="rounded-lg border border-border px-4 py-2"
                href={`/rentals?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              >
                Previous
              </Link>
            ) : null}
            <span className="text-sm text-muted-foreground">
              Page {page} of {products.meta.totalPages}
            </span>
            {page < products.meta.totalPages ? (
              <Link
                className="rounded-lg border border-border px-4 py-2"
                href={`/rentals?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
