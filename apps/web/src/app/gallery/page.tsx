import type { Metadata } from 'next';
import { Camera, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GalleryCard } from '@/components/gallery-card';
import { GalleryUnavailable } from '@/components/gallery-unavailable';
import { ProductCard } from '@/components/product-card';
import {
  getPublicGallery,
  PublicGalleryUnavailable,
} from '@/lib/public-gallery';
import { listProducts } from '@/lib/public-catalogue';
import { publicPageRobots } from '@/lib/site-config';
import { galleryServiceSlugSchema } from '@mensah-rentals/validation';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const type = (await searchParams).type;
  const filtered = typeof type === 'string' && type.length > 0;
  const description =
    'See Mensah Rentals equipment supporting film productions, events and festivals, corporate functions, and private functions.';
  return {
    title: 'Event and Production Gallery',
    description,
    alternates: { canonical: '/gallery' },
    openGraph: {
      title: 'Equipment in Action | Mensah Rentals Gallery',
      description,
      url: '/gallery',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Equipment in Action | Mensah Rentals Gallery',
      description,
    },
    robots: publicPageRobots(!filtered),
  };
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const raw = await searchParams;
  const keys = Object.keys(raw);
  if (keys.some((key) => key !== 'type') || Array.isArray(raw.type)) notFound();
  const parsedType = raw.type
    ? galleryServiceSlugSchema.safeParse(raw.type)
    : null;
  if (parsedType && !parsedType.success) notFound();
  const type = parsedType?.data;

  let gallery;
  try {
    gallery = await getPublicGallery(type);
  } catch (error) {
    if (!(error instanceof PublicGalleryUnavailable)) throw error;
    return <GalleryPageUnavailable />;
  }

  const featuredProducts = await listProducts(
    '?page=1&pageSize=4&isFeatured=true&sort=featured',
  ).catch(() => null);

  return (
    <>
      <section className="relative isolate min-h-[27rem] overflow-hidden border-b border-white/10 bg-slate-950 text-white sm:min-h-[32rem]">
        {gallery.items[0]?.cover ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-cover bg-center opacity-65"
            style={{
              backgroundImage: `url(${gallery.items[0].cover.url})`,
              backgroundPosition: gallery.items[0].cover.focalPoint,
            }}
          />
        ) : null}
        <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(8,12,20,.56),rgba(8,12,20,.86))] lg:bg-[linear-gradient(90deg,rgba(8,12,20,.90)_0%,rgba(8,12,20,.62)_58%,rgba(8,12,20,.38)_100%)]" />
        <div className="public-container flex min-h-[27rem] flex-col pb-14 pt-8 sm:min-h-[32rem] sm:pb-20">
          <nav aria-label="Breadcrumb" className="text-sm text-white/75">
            <ol className="flex items-center gap-2">
              <li>
                <Link
                  className="rounded outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                  href="/"
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="h-4 w-4" />
              </li>
              <li aria-current="page">Gallery</li>
            </ol>
          </nav>
          <div className="mt-auto max-w-4xl pt-16">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
              Our work
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Equipment in action.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-200 sm:text-xl sm:leading-8">
              Explore productions, events, corporate functions, and private
              functions supported by Mensah Rentals.
            </p>
          </div>
        </div>
      </section>

      <main className="public-container py-12 sm:py-16 lg:py-20">
        <nav
          aria-label="Filter Gallery by service"
          className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        >
          <ul className="flex min-w-max gap-2">
            <li>
              <FilterLink active={!type} href="/gallery" label="All" />
            </li>
            {gallery.services.map((service) => (
              <li key={service.slug}>
                <FilterLink
                  active={type === service.slug}
                  href={`/gallery?type=${service.slug}`}
                  label={service.label}
                />
              </li>
            ))}
          </ul>
        </nav>

        <section className="mt-9" aria-labelledby="gallery-projects-title">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Recent work
            </p>
            <h2
              className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
              id="gallery-projects-title"
            >
              {type
                ? `${gallery.services.find((service) => service.slug === type)?.label ?? 'Selected'} projects`
                : 'Projects across the work we support'}
            </h2>
          </div>
          {gallery.items.length ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {gallery.items.map((project, index) => (
                <GalleryCard
                  key={project.slug}
                  priority={index < 2}
                  project={project}
                />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-border bg-card p-10 text-center sm:p-14">
              <Camera
                aria-hidden="true"
                className="mx-auto h-10 w-10 text-primary"
              />
              <h2 className="mt-4 text-xl font-semibold">
                No published projects in this view yet
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Explore all Gallery projects or browse equipment for your next
                event or production.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 min-[380px]:flex-row">
                {type ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 font-semibold"
                    href="/gallery"
                  >
                    View all projects
                  </Link>
                ) : null}
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
                  href="/rentals"
                >
                  Browse rentals
                </Link>
              </div>
            </div>
          )}
        </section>

        {featuredProducts?.items.length ? (
          <section
            className="mt-20 border-t border-border pt-16"
            aria-labelledby="gallery-gear-title"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  Rental catalogue
                </p>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                  id="gallery-gear-title"
                >
                  Popular rental gear
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  Explore customer-safe equipment details and build a list for
                  our team.
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
                href="/rentals"
              >
                View all rentals{' '}
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {featuredProducts.items.map((product) => (
                <ProductCard
                  key={`${product.category.slug}/${product.slug}`}
                  product={product}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

function FilterLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/60 hover:bg-muted'}`}
      href={href}
      scroll={false}
    >
      {label}
    </Link>
  );
}

function GalleryPageUnavailable() {
  return (
    <main className="public-container py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Our work
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Mensah Rentals Gallery
        </h1>
      </div>
      <div className="mt-9">
        <GalleryUnavailable />
      </div>
    </main>
  );
}
