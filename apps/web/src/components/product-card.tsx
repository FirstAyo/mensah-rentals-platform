import type { PublicProductSummaryResponse } from '@mensah-rentals/types';
import Image from 'next/image';
import Link from 'next/link';
export function ProductCard({
  product,
}: {
  product: PublicProductSummaryResponse;
}) {
  const image =
    product.images.find((item) => item.isPrimary) ?? product.images[0];
  const managed = image?.url.startsWith('/media/') ? image : null;
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[4/3] bg-muted">
        {managed ? (
          <Image
            alt={managed.altText}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1200px) 33vw, 25vw"
            src={managed.url}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Product image coming soon
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {product.category.name}
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          <Link href={`/rentals/${product.category.slug}/${product.slug}`}>
            {product.name}
          </Link>
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {product.shortDescription}
        </p>
        <p className="mt-4 text-sm">Requested by the {product.rentalUnit}</p>
      </div>
    </article>
  );
}
