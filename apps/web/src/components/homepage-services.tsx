import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

const services = [
  {
    label: 'Film Production',
    slug: 'film-production',
    match: /film|production/i,
  },
  {
    label: 'Events & Festivals',
    slug: 'events-festivals',
    match: /event|festival/i,
  },
  {
    label: 'Corporate Functions',
    slug: 'corporate-functions',
    match: /corporate/i,
  },
  { label: 'Private Functions', slug: 'private-functions', match: /private/i },
] as const;

type Solution = {
  altText: string;
  description: string;
  enabled: boolean;
  focalPoint: 'center' | 'top' | 'bottom' | 'left' | 'right';
  imageUrl: string | null;
  serviceType:
    | 'FILM_PRODUCTION'
    | 'EVENTS_FESTIVALS'
    | 'CORPORATE_FUNCTIONS'
    | 'PRIVATE_FUNCTIONS';
  title: string;
};

export function HomepageServices({
  block,
}: {
  block: {
    description: string;
    enabled: boolean;
    eyebrow: string;
    heading: string;
    items: Solution[];
  };
}) {
  if (!block.enabled) return null;
  const enabled = block.items.filter((item) => item.enabled);
  return (
    <section
      className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      aria-labelledby="services-title"
    >
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          {block.eyebrow || 'Services'}
        </p>
        <h2
          className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
          id="services-title"
        >
          {block.heading || 'Equipment support for every kind of project'}
        </h2>
        {block.description ? (
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            {block.description}
          </p>
        ) : null}
      </div>
      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {services.map((service, index) => {
          const serviceType = [
            'FILM_PRODUCTION',
            'EVENTS_FESTIVALS',
            'CORPORATE_FUNCTIONS',
            'PRIVATE_FUNCTIONS',
          ][index];
          const source =
            enabled.find((item) => item.serviceType === serviceType) ??
            enabled.find((item) => service.match.test(item.title));
          if (!source) return null;
          return (
            <Link
              className="group relative min-h-72 overflow-hidden rounded-3xl border border-border bg-slate-900 p-6 text-white shadow-sm outline-none transition hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none"
              href={`/gallery?type=${service.slug}`}
              key={service.slug}
            >
              {source?.imageUrl ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover transition duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                  style={{
                    backgroundImage: `url(${source.imageUrl})`,
                    backgroundPosition: source.focalPoint,
                  }}
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/15" />
              <span className="relative flex h-full flex-col justify-end">
                <span className="flex items-end justify-between gap-4">
                  <span className="text-2xl font-bold">{service.label}</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-amber-300 transition group-hover:-translate-y-1 group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
                  />
                </span>
                {source?.description ? (
                  <span className="mt-3 text-sm leading-6 text-slate-200">
                    {source.description}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
