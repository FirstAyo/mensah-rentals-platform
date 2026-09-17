import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { ContinuousRailViewport } from '@/components/continuous-rail-viewport';

type FeaturedCategory = {
  description: string | null;
  image: { focalPoint: string; url: string | null };
  name: string;
  slug: string;
};

export function HomepageFeaturedCategories({
  categories,
  content,
}: {
  categories: FeaturedCategory[];
  content: { description: string; eyebrow: string; heading: string };
}) {
  if (!categories.length) return null;
  return (
    <section
      className="overflow-hidden border-b border-border py-14 sm:py-16 lg:py-20"
      data-homepage-section="featured-categories"
    >
      <div className="public-container">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          {content.eyebrow}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {content.heading}
            </h2>
            {content.description ? (
              <p className="mt-3 leading-7 text-muted-foreground">
                {content.description}
              </p>
            ) : null}
          </div>
          <Link
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
            href="/rentals"
          >
            All categories <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <ContinuousRailViewport className="mt-8" data-direction="right">
        <div className="continuous-rail-track continuous-rail-right flex w-max">
          <CategoryGroup categories={categories} />
          <div
            aria-hidden="true"
            className="continuous-rail-clone flex gap-3 pr-3 sm:gap-4 sm:pr-4"
          >
            {categories.map((category, index) => (
              <CategoryCard
                category={category}
                key={`clone-${category.slug}-${index}`}
                tabIndex={-1}
              />
            ))}
          </div>
        </div>
      </ContinuousRailViewport>
    </section>
  );
}

function CategoryGroup({ categories }: { categories: FeaturedCategory[] }) {
  return (
    <div className="flex gap-3 pr-3 sm:gap-4 sm:pr-4">
      {categories.map((category, index) => (
        <CategoryCard category={category} key={`${category.slug}-${index}`} />
      ))}
    </div>
  );
}

function CategoryCard({
  category,
  tabIndex,
}: {
  category: FeaturedCategory;
  tabIndex?: number;
}) {
  return (
    <Link
      className="group relative h-40 w-56 shrink-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-44 sm:w-64"
      href={`/rentals/${category.slug}`}
      tabIndex={tabIndex}
    >
      {category.image.url ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
          style={{
            backgroundImage: `url(${category.image.url})`,
            backgroundPosition: category.image.focalPoint,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,hsl(var(--primary)/.28),transparent_48%),linear-gradient(145deg,hsl(var(--muted)),hsl(var(--card)))]"
        />
      )}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-lg font-bold text-white">
        {category.name}
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-amber-300 transition group-hover:translate-x-1 motion-reduce:transition-none"
        />
      </span>
    </Link>
  );
}
