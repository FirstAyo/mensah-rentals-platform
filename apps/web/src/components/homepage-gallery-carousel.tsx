'use client';

import type { PublicGalleryProjectSummaryResponse } from '@mensah-rentals/types';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { GalleryCard } from './gallery-card';
import { useHorizontalCarousel } from '@/lib/use-horizontal-carousel';

export function HomepageGalleryCarousel({
  projects,
  content,
}: {
  projects: PublicGalleryProjectSummaryResponse[];
  content: {
    ctaLabel: string;
    description: string;
    eyebrow: string;
    heading: string;
  };
}) {
  const carousel = useHorizontalCarousel({
    intervalMs: 6500,
    itemCount: projects.length,
  });

  return (
    <section
      className="border-y border-border bg-muted/35"
      aria-labelledby="homepage-gallery-title"
      data-homepage-section="recent-work"
      {...carousel.sectionProps}
    >
      <div className="public-container py-16 lg:py-24">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
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
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {content.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous Gallery projects"
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => carousel.move(-1)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              aria-label="Next Gallery projects"
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => carousel.move(1)}
              type="button"
            >
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          className="-mx-4 mt-9 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
          {...carousel.trackProps}
        >
          {projects.map((project) => (
            <div
              className="w-[88%] shrink-0 snap-start sm:w-[48%] xl:w-[32%]"
              key={project.slug}
            >
              <GalleryCard project={project} />
            </div>
          ))}
        </div>
        <Link
          className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/gallery"
        >
          {content.ctaLabel}{' '}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
