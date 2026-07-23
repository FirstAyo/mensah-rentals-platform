import type { PublicProductSummaryResponse } from '@mensah-rentals/types';
import { ArrowUpRight, ImageIcon, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export function ProductCard({
  product,
}: {
  product: PublicProductSummaryResponse;
}) {
  const image =
    product.images.find((item) => item.isPrimary) ?? product.images[0];
  const managed = image?.url.startsWith('/media/products/') ? image : null;
  const href = `/rentals/${product.category.slug}/${product.slug}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <Link
        aria-label={`View ${product.name}`}
        className="relative block aspect-[4/3] overflow-hidden bg-muted outline-none"
        href={href}
      >
        {managed ? (
          <Image
            alt={managed.altText}
            className="object-cover transition duration-300 group-hover:scale-[1.025]"
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1200px) 33vw, 25vw"
            src={managed.url}
          />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageIcon aria-hidden="true" className="h-7 w-7" />
            Product image coming soon
          </span>
        )}
        {product.isFeatured ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            Featured
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {product.category.name}
        </p>
        <h3 className="mt-2 text-xl font-semibold leading-tight">
          <Link className="outline-none" href={href}>
            {product.name}
          </Link>
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {product.shortDescription}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
          <span className="text-muted-foreground">
            Rental unit: {product.rentalUnit}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            View details
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
