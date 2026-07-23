import type { Metadata } from 'next';
import { ArrowLeft, CheckCircle2, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
import { ProductCard } from '@/components/product-card';
import { ProductGallery } from '@/components/product-gallery';
import { getProduct, PublicCatalogueNotFound } from '@/lib/public-catalogue';
import { siteOrigin } from '@/lib/site-config';
import { productJsonLd } from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

async function productOr404(categorySlug: string, productSlug: string) {
  try {
    return await getProduct(categorySlug, productSlug);
  } catch (error) {
    if (error instanceof PublicCatalogueNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}): Promise<Metadata> {
  const value = await params;
  const product = await productOr404(value.categorySlug, value.productSlug);
  const path = `/rentals/${product.category.slug}/${product.slug}`;
  const image =
    product.images.find((item) => item.isPrimary) ?? product.images[0];
  const images = image?.url.startsWith('/media/products/')
    ? [{ url: image.url, alt: image.altText }]
    : undefined;
  return {
    title: product.name,
    description: product.shortDescription,
    alternates: { canonical: path },
    openGraph: {
      title: `${product.name} | Mensah Rentals`,
      description: product.shortDescription,
      images,
      url: path,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: product.name,
      description: product.shortDescription,
      images: images?.map((item) => item.url),
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const value = await params;
  const product = await productOr404(value.categorySlug, value.productSlug);
  const origin = siteOrigin();
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/rentals', label: 'Rentals' },
    { href: `/rentals/${product.category.slug}`, label: product.category.name },
    { label: product.name },
  ];

  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(crumbs, origin)).replace(
            /</g,
            '\\u003c',
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd(product, origin)).replace(
            /</g,
            '\\u003c',
          ),
        }}
        type="application/ld+json"
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(22rem,.88fr)] lg:gap-14">
        <ProductGallery images={product.images} productName={product.name} />
        <article className="lg:pt-3">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            {product.category.name}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {product.description ?? product.shortDescription}
          </p>

          <dl className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Rental unit
              </dt>
              <dd className="mt-1 font-semibold capitalize">
                {product.rentalUnit}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quote method
              </dt>
              <dd className="mt-1 font-semibold">Reviewed by staff</dd>
            </div>
          </dl>

          <aside className="mt-6 rounded-2xl border border-primary/30 bg-accent p-5 text-accent-foreground">
            <div className="flex gap-3">
              <ClipboardList
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <div>
                <h2 className="font-semibold">How this rental is confirmed</h2>
                <p className="mt-1 text-sm leading-6">
                  Tell our team the quantity and dates your project requires.
                  Authorized staff review supply privately and prepare a custom
                  quote. No automatic price or public stock count is shown.
                </p>
              </div>
            </div>
          </aside>

          {product.specifications.length ? (
            <section className="mt-8">
              <h2 className="text-2xl font-semibold">Specifications</h2>
              <dl className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {product.specifications.map((item) => (
                  <div
                    className="grid gap-1 p-4 sm:grid-cols-2"
                    key={item.label}
                  >
                    <dt className="font-medium">{item.label}</dt>
                    <dd className="text-muted-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href={`/rentals/${product.category.slug}`}
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Browse {product.category.name}
            </Link>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="h-4 w-4 text-primary"
              />
              Online rental requests will be introduced in a later phase
            </span>
          </div>
        </article>
      </div>

      {product.relatedProducts.length ? (
        <section
          className="mt-20 border-t border-border pt-12"
          aria-labelledby="related-title"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            More in {product.category.name}
          </p>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight"
            id="related-title"
          >
            Related equipment
          </h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {product.relatedProducts.map((related) => (
              <ProductCard key={related.slug} product={related} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
