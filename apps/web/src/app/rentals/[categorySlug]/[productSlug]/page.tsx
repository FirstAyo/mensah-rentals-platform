import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/breadcrumbs';
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
  return {
    title: product.name,
    description: product.shortDescription,
    alternates: { canonical: path },
    openGraph: {
      title: `${product.name} | Mensah Rentals`,
      description: product.shortDescription,
      url: path,
    },
    twitter: {
      card: 'summary',
      title: product.name,
      description: product.shortDescription,
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
  const managed = (
    product.images.find((item) => item.isPrimary) ?? product.images[0]
  )?.url.startsWith('/media/')
    ? (product.images.find((item) => item.isPrimary) ?? product.images[0])
    : undefined;
  const jsonLd = productJsonLd(product, origin);
  return (
    <div className="mx-auto max-w-[1760px] px-4 py-10 sm:px-6 lg:px-8">
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
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
        type="application/ld+json"
      />
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
          {managed ? (
            <Image
              alt={managed.altText}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={managed.url}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Product image coming soon
            </div>
          )}
        </div>
        <article>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            {product.category.name}
          </p>
          <h1 className="mt-3 text-4xl font-bold">{product.name}</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {product.description ?? product.shortDescription}
          </p>
          <p className="mt-6 rounded-xl border border-border bg-card p-4">
            Rental requests are reviewed by our team, who will confirm suitable
            quantities and prepare a custom quote.
          </p>
          {product.specifications.length ? (
            <section className="mt-8">
              <h2 className="text-2xl font-semibold">Specifications</h2>
              <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
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
        </article>
      </div>
    </div>
  );
}
