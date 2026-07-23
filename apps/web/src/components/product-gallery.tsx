'use client';

import type { PublicProductImageResponse } from '@mensah-rentals/types';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export function ProductGallery({
  images,
  productName,
}: {
  images: PublicProductImageResponse[];
  productName: string;
}) {
  const managed = images
    .filter((image) => image.url.startsWith('/media/products/'))
    .slice(0, 4);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<number[]>([]);
  const active = managed[selected];
  const activeFailed = failed.includes(selected);

  return (
    <section aria-label={`${productName} image gallery`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-muted shadow-sm">
        {active && !activeFailed ? (
          <Image
            alt={active.altText}
            className="object-cover"
            fill
            onError={() => setFailed((value) => [...value, selected])}
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
            src={active.url}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon aria-hidden="true" className="h-9 w-9" />
            <span className="text-sm">Product image coming soon</span>
          </div>
        )}
      </div>
      {managed.length > 1 ? (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {managed.map((image, index) => (
            <button
              aria-label={`Show image ${index + 1}: ${image.altText}`}
              aria-pressed={selected === index}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary"
              key={`${image.url}-${index}`}
              onClick={() => setSelected(index)}
              type="button"
            >
              {failed.includes(index) ? (
                <ImageIcon
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
                />
              ) : (
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  onError={() => setFailed((value) => [...value, index])}
                  sizes="(max-width: 1024px) 25vw, 12vw"
                  src={image.url}
                />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
