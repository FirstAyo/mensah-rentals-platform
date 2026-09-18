import type { Metadata } from 'next';
import { Camera, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GalleryLightbox } from '@/components/gallery-lightbox';
import { GalleryUnavailable } from '@/components/gallery-unavailable';
import { HomepageFeaturedCategories } from '@/components/homepage-featured-categories';
import { ProductCard } from '@/components/product-card';
import { selectGalleryProducts } from '@/lib/gallery-merchandising';
import { GALLERY_PAGE_SIZE } from '@/lib/gallery-photo-layout';
import { listProducts } from '@/lib/public-catalogue';
import {
  getPublicGallery,
  PublicGalleryUnavailable,
} from '@/lib/public-gallery';
import { getPublicHomepage } from '@/lib/public-homepage';
import { publicPageRobots } from '@/lib/site-config';
import {
  galleryServiceSlugSchema,
  gallerySlugSchema,
} from '@mensah-rentals/validation';

export const dynamic = 'force-dynamic';
type Params = {
  event?: string | string[];
  page?: string | string[];
  type?: string | string[];
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const filtered = Boolean(raw.type || raw.event || raw.page);
  const description =
    'Explore real productions, festivals, corporate functions, and private events supported by Mensah Rentals.';
  return {
    title: { absolute: 'Equipment in Action | Mensah Rentals Gallery' },
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
  if (Object.keys(raw).some((key) => !['event', 'page', 'type'].includes(key)))
    notFound();
  if ([raw.event, raw.page, raw.type].some(Array.isArray)) notFound();

  const parsedType = raw.type
    ? galleryServiceSlugSchema.safeParse(raw.type)
    : null;
  const parsedEvent = raw.event ? gallerySlugSchema.safeParse(raw.event) : null;
  const page = raw.page ? Number(raw.page) : 1;
  if (
    (parsedType && !parsedType.success) ||
    (parsedEvent && !parsedEvent.success) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000
  )
    notFound();
  const type = parsedType?.data;
  const event = parsedEvent?.data;

  let gallery;
  try {
    const first = await getPublicGallery(type, {
      event,
      page: 1,
      pageSize: GALLERY_PAGE_SIZE,
    });
    if (page > Math.max(first.meta.totalPages, 1)) notFound();
    const later = await Promise.all(
      Array.from({ length: Math.max(0, page - 1) }, (_, index) =>
        getPublicGallery(type, {
          event,
          page: index + 2,
          pageSize: GALLERY_PAGE_SIZE,
        }),
      ),
    );
    gallery = {
      ...first,
      photos: [first, ...later].flatMap((result) => result.photos),
      meta: later.at(-1)?.meta ?? first.meta,
    };
  } catch (error) {
    if (!(error instanceof PublicGalleryUnavailable)) throw error;
    return <GalleryPageUnavailable />;
  }

  const selectedProject = event
    ? gallery.items.find((item) => item.slug === event)
    : null;
  const [catalogue, homepage] = await Promise.all([
    listProducts('?page=1&pageSize=24&sort=featured').catch(() => null),
    getPublicHomepage().catch(() => null),
  ]);
  const galleryProducts = selectGalleryProducts(catalogue?.items ?? []);
  const currentLabel = type
    ? gallery.services.find((service) => service.slug === type)?.label
    : null;

  return (
    <>
      <section className="relative isolate min-h-[22rem] overflow-hidden border-b border-white/10 bg-slate-950 text-white sm:min-h-[26rem]">
        {gallery.photos[0] ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-20 bg-cover bg-center opacity-65"
            style={{
              backgroundImage: `url(${gallery.photos[0].image.url})`,
              backgroundPosition: gallery.photos[0].image.focalPoint,
            }}
          />
        ) : null}
        <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(8,12,20,.58),rgba(8,12,20,.88))] lg:bg-[linear-gradient(90deg,rgba(8,12,20,.92)_0%,rgba(8,12,20,.66)_58%,rgba(8,12,20,.38)_100%)]" />
        <div className="public-container flex min-h-[22rem] flex-col pb-12 pt-8 sm:min-h-[26rem] sm:pb-14">
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
          <div className="mt-auto max-w-4xl pt-12">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
              Our work
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
              A closer look at the work.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">
              Real equipment, real settings, and the events and productions our
              team has helped support.
            </p>
          </div>
        </div>
      </section>

      <main>
        <div className="public-container py-10 sm:py-14 lg:py-16">
          <nav
            aria-label="Filter Gallery by service"
            className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
          >
            <ul className="flex min-w-max gap-2">
              <li>
                <FilterLink
                  active={!type && !event}
                  href="/gallery"
                  label="All"
                />
              </li>
              {gallery.services.map((service) => (
                <li key={service.slug}>
                  <FilterLink
                    active={type === service.slug && !event}
                    href={`/gallery?type=${service.slug}`}
                    label={service.label}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <section className="mt-7" aria-labelledby="gallery-photos-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  Visual portfolio
                </p>
                <h2
                  className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                  id="gallery-photos-title"
                >
                  {selectedProject?.title ??
                    (currentLabel
                      ? `${currentLabel} photos`
                      : 'Moments from recent work')}
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {selectedProject?.shortDescription ??
                    'Select any image to explore the full-size photograph and its event context.'}
                </p>
              </div>
              {event ? (
                <Link
                  className="inline-flex min-h-11 items-center font-semibold text-primary"
                  href="/gallery"
                >
                  View all Gallery photos
                </Link>
              ) : null}
            </div>

            {gallery.photos.length ? (
              <div className="mt-7">
                <GalleryLightbox
                  event={event}
                  initialPage={gallery.meta.page}
                  photos={gallery.photos}
                  total={gallery.meta.total}
                  type={type}
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-dashed border-border bg-card p-10 text-center sm:p-14">
                <Camera
                  aria-hidden="true"
                  className="mx-auto h-10 w-10 text-primary"
                />
                <h2 className="mt-4 text-xl font-semibold">
                  {currentLabel
                    ? `No ${currentLabel} photos have been published yet.`
                    : 'No Gallery photos have been published yet.'}
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  View all Gallery photos or browse rental equipment for your
                  next project.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 min-[380px]:flex-row">
                  {type || event ? (
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 font-semibold"
                      href="/gallery"
                    >
                      View all Gallery photos
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

          {galleryProducts.length ? (
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
                    Explore rental equipment
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
                {galleryProducts.map((product) => (
                  <ProductCard
                    key={`${product.category.slug}/${product.slug}`}
                    product={product}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {homepage?.categories.length ? (
          <HomepageFeaturedCategories
            categories={homepage.categories}
            content={{
              description:
                'Explore equipment by category for events, productions, and projects.',
              eyebrow: 'Rental categories',
              heading: 'Browse by category',
            }}
          />
        ) : null}

        <div className="public-container pb-10 pt-16 sm:pb-14 lg:pb-16">
          <section
            className="rounded-3xl bg-slate-950 px-6 py-12 text-white sm:px-10 lg:px-14"
            aria-labelledby="gallery-contact-title"
          >
            <h2 className="text-3xl font-bold" id="gallery-contact-title">
              Planning an event or production?
            </h2>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Tell our team what you need and when you need it. We will review
              the details before confirming equipment and pricing.
            </p>
            <div className="mt-6 flex flex-col gap-3 min-[380px]:flex-row">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-5 font-semibold text-slate-950"
                href="/rentals"
              >
                Browse rentals
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/30 px-5 font-semibold"
                href="/contact"
              >
                Contact our team
              </Link>
            </div>
          </section>
        </div>
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
