import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

type FeaturedCategory = {
  description: string | null;
  image: { focalPoint: string; url: string | null };
  name: string;
  slug: string;
};

/**
 * Preserved for future Homepage use. Phase 19.2.2 intentionally hides this
 * section without deleting its CMS content, relationships, or presentation.
 */
export function HomepageFeaturedCategories({
  categories,
  content,
}: {
  categories: FeaturedCategory[];
  content: { description: string; eyebrow: string; heading: string };
}) {
  return (
    <section
      className="public-container pb-16 pt-8 sm:pt-10 lg:pb-24 lg:pt-10"
      data-homepage-section="featured-categories"
    >
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
          {content.eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {content.heading}
        </h2>
        {content.description ? (
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            {content.description}
          </p>
        ) : null}
      </div>
      <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category, index) => (
          <Link
            className={`group relative min-h-64 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${index === 0 ? 'md:col-span-2 xl:row-span-2 xl:min-h-[34rem]' : ''}`}
            href={`/rentals/${category.slug}`}
            key={category.slug}
          >
            {category.image.url ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-cover transition duration-500 group-hover:scale-105"
                style={{
                  backgroundImage: `url(${category.image.url})`,
                  backgroundPosition: category.image.focalPoint,
                }}
              />
            ) : (
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,hsl(var(--primary)/.24),transparent_48%),linear-gradient(145deg,hsl(var(--muted)),hsl(var(--card)))]" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/15" />
            <span className="relative flex h-full flex-col">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                Category {String(index + 1).padStart(2, '0')}
              </span>
              <span className="mt-auto flex items-end justify-between gap-4 text-2xl font-bold text-white sm:text-3xl">
                {category.name}
                <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" />
              </span>
              {category.description ? (
                <span className="mt-3 max-w-xl text-sm leading-6 text-slate-200">
                  {category.description}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
