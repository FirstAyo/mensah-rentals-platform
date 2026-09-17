import type { PublicGalleryPhotoResponse } from '@mensah-rentals/types';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { ContinuousRailViewport } from '@/components/continuous-rail-viewport';

export function HomepageGalleryCarousel({
  photos,
  content,
}: {
  photos: PublicGalleryPhotoResponse[];
  content: {
    ctaLabel: string;
    description: string;
    eyebrow: string;
    heading: string;
  };
}) {
  if (!photos.length) return null;
  const enough = photos.length >= 4;
  const midpoint = Math.ceil(photos.length / 2);
  const rows = [photos.slice(0, midpoint), photos.slice(midpoint)];

  return (
    <section
      className="overflow-hidden border-y border-border bg-muted/35 py-14 sm:py-16 lg:py-20"
      aria-labelledby="homepage-gallery-title"
      data-homepage-section="recent-work"
    >
      <div className="public-container flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            {content.eyebrow || 'Gallery'}
          </p>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
            id="homepage-gallery-title"
          >
            {content.heading}
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            {content.description}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
          href="/gallery"
        >
          {content.ctaLabel}{' '}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-8 space-y-[6px]" data-direction="left">
        {rows
          .filter((row) => row.length)
          .map((row, rowIndex) => (
            <ContinuousRailViewport key={rowIndex}>
              <div
                className={`${enough ? 'continuous-rail-left' : ''} flex w-max`}
              >
                <PhotoGroup photos={row} />
                {enough ? (
                  <div
                    aria-hidden="true"
                    className="continuous-rail-clone flex gap-[6px] pr-[6px]"
                  >
                    {row.map((photo, index) => (
                      <PhotoCard
                        key={`clone-${photo.key}-${index}`}
                        photo={photo}
                        tabIndex={-1}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </ContinuousRailViewport>
          ))}
      </div>
    </section>
  );
}

function PhotoGroup({ photos }: { photos: PublicGalleryPhotoResponse[] }) {
  return (
    <div className="flex gap-[6px] pr-[6px]">
      {photos.map((photo, index) => (
        <PhotoCard key={`${photo.key}-${index}`} photo={photo} />
      ))}
    </div>
  );
}

function PhotoCard({
  photo,
  tabIndex,
}: {
  photo: PublicGalleryPhotoResponse;
  tabIndex?: number;
}) {
  return (
    <Link
      className="group relative h-44 w-64 shrink-0 overflow-hidden rounded-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-52 sm:w-80 lg:h-56 lg:w-[22rem]"
      data-homepage-gallery-photo
      href={`/gallery?event=${encodeURIComponent(photo.event.slug)}`}
      tabIndex={tabIndex}
    >
      <Image
        alt={photo.image.altText}
        className="object-cover transition duration-500 group-hover:scale-[1.015] motion-reduce:transition-none"
        fill
        sizes="(min-width:1024px) 352px, (min-width:640px) 320px, 256px"
        src={photo.image.url}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 p-4 text-sm font-semibold text-white sm:text-base">
        {photo.event.title}
      </span>
    </Link>
  );
}
