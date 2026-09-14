import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Headphones,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { HomepageHero } from '@/components/homepage-hero';
import { HomepageGalleryCarousel } from '@/components/homepage-gallery-carousel';
import { HomepageServices } from '@/components/homepage-services';
import {
  HomepageGoogleReviews,
  HomepageGoogleReviewsFallback,
} from '@/components/homepage-google-reviews';
import { ProductCard } from '@/components/product-card';
import { getPublicHomepage } from '@/lib/public-homepage';
import { getPublicGallery } from '@/lib/public-gallery';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import {
  organizationJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { content } = await getPublicHomepage();
    const social = content.seo.socialImageUrl ?? undefined;
    return {
      title: { absolute: content.seo.title },
      description: content.seo.description,
      alternates: { canonical: '/' },
      openGraph: {
        title: content.seo.title,
        description: content.seo.description,
        url: '/',
        images: social ? [{ url: social }] : undefined,
      },
      twitter: {
        card: social ? 'summary_large_image' : 'summary',
        title: content.seo.title,
        description: content.seo.description,
        images: social ? [social] : undefined,
      },
      robots: publicPageRobots(),
    };
  } catch {
    const description =
      'Browse equipment for events, productions, and projects, then submit a rental request for a custom quote from Mensah Rentals.';
    return {
      title: { absolute: 'Mensah Rentals | Equipment Rental Requests' },
      description,
      alternates: { canonical: '/' },
      openGraph: {
        title: 'Mensah Rentals | Equipment Rental Requests',
        description,
        type: 'website',
        url: '/',
      },
      twitter: {
        card: 'summary',
        title: 'Mensah Rentals | Equipment Rental Requests',
        description,
      },
      robots: publicPageRobots(),
    };
  }
}

const icons = {
  'badge-check': BadgeCheck,
  'calendar-check': CheckCircle2,
  'clipboard-check': ClipboardCheck,
  clock: CheckCircle2,
  headphones: Headphones,
  'map-pin': MapPin,
  'package-check': PackageCheck,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  truck: Truck,
  users: Users,
  warehouse: Warehouse,
} as const;

export default async function HomePage() {
  const [homepage, gallery] = await Promise.all([
    getPublicHomepage(),
    getPublicGallery().catch(() => null),
  ]);
  const { content, products, googleReviews } = homepage;
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd(siteOrigin())),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(websiteJsonLd(siteOrigin())),
        }}
        type="application/ld+json"
      />
      <HomepageHero hero={content.hero} />
      <div
        className="border-b border-border bg-card dark:bg-card"
        data-homepage-section="reassurance"
      >
        <ul
          aria-label="Rental reassurance"
          className="public-container grid grid-cols-2 gap-px lg:grid-cols-4"
        >
          {content.trustItems
            .filter((item) => item.enabled)
            .map((item) => {
              const Icon = icons[item.icon];
              return (
                <li
                  className="flex min-h-[4.5rem] items-center justify-center gap-2 bg-card px-3 py-3 text-center text-sm font-medium leading-5 sm:min-h-20 sm:px-4 sm:py-4"
                  key={item.label}
                >
                  <Icon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-primary"
                  />
                  {item.label}
                </li>
              );
            })}
        </ul>
      </div>

      <HomepageServices block={content.solutions} />

      {content.gallery.enabled &&
      (homepage.galleryProjects.length || gallery?.items.length) ? (
        <HomepageGalleryCarousel
          content={content.gallery}
          projects={
            homepage.galleryProjects.length
              ? homepage.galleryProjects
              : (gallery?.items.slice(0, 8) ?? [])
          }
        />
      ) : null}

      {content.featuredProducts.enabled && products.length ? (
        <section
          className="public-container py-16 lg:py-24"
          data-homepage-section="featured-equipment"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Heading block={content.featuredProducts} />
            <Link
              className="inline-flex items-center gap-2 font-semibold text-primary"
              href="/rentals"
            >
              Full catalogue <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-9 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={`${product.category.slug}/${product.slug}`}
                product={product}
              />
            ))}
          </div>
        </section>
      ) : null}

      {content.benefits.enabled ? (
        <section
          className="border-y border-border bg-muted/45"
          data-homepage-section="why-mensah-rentals"
        >
          <div className="public-container py-16 lg:py-24">
            <Heading block={content.benefits} />
            <ul className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {content.benefits.items
                .filter((item) => item.enabled)
                .map((item) => {
                  const Icon = icons[item.icon];
                  return (
                    <li
                      className="rounded-2xl border border-border bg-card p-6"
                      key={item.title}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 text-xl font-semibold">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    </li>
                  );
                })}
            </ul>
          </div>
        </section>
      ) : null}

      {content.process.enabled ? (
        <section
          className="border-y border-border bg-slate-950 text-white"
          id="how-it-works"
        >
          <div className="public-container py-16 lg:py-24">
            <Heading block={content.process} inverted />
            <ol className="mt-10 grid gap-5 md:grid-cols-4">
              {content.process.steps.map((step, index) => (
                <li
                  className="relative border-l border-white/20 pl-5"
                  key={step.title}
                >
                  <span className="text-sm font-bold text-amber-300">
                    0{index + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {content.reviews.enabled ? (
        <Suspense
          fallback={
            <HomepageGoogleReviewsFallback
              links={googleReviews}
              section={content.reviews}
            />
          }
        >
          <HomepageGoogleReviews
            links={googleReviews}
            section={content.reviews}
          />
        </Suspense>
      ) : null}

      {content.pickupDelivery.enabled ? (
        <section className="public-container relative grid gap-8 overflow-hidden py-16 lg:grid-cols-[.8fr_1.2fr] lg:py-24">
          {content.pickupDelivery.imageUrl ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-cover bg-center opacity-10"
              style={{
                backgroundImage: `url(${content.pickupDelivery.imageUrl})`,
              }}
            />
          ) : null}
          <Heading block={content.pickupDelivery} />
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard
              icon={Warehouse}
              title={content.pickupDelivery.pickupTitle}
              text={content.pickupDelivery.pickupDescription}
            />
            <InfoCard
              icon={Truck}
              title={content.pickupDelivery.deliveryTitle}
              text={content.pickupDelivery.deliveryDescription}
            />
          </div>
        </section>
      ) : null}

      {content.serviceAreas.enabled ? (
        <section className="border-y border-border">
          <div className="public-container py-16">
            <Heading block={content.serviceAreas} />
            <ul className="mt-7 flex flex-wrap gap-3">
              {content.serviceAreas.areas
                .filter((area) => area.enabled)
                .map((area) => (
                  <li
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm"
                    key={area.label}
                  >
                    <MapPin className="h-4 w-4 text-primary" />
                    {area.label}
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="public-container py-16 lg:py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-14 text-primary-foreground sm:px-10 lg:px-16">
          {content.finalCta.imageUrl ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${content.finalCta.imageUrl})` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,.22),transparent_34%)]" />
          <div className="relative max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              {content.finalCta.heading}
            </h2>
            <p className="mt-4 text-lg opacity-90">
              {content.finalCta.description}
            </p>
            <div className="mt-7 flex flex-col gap-3 min-[380px]:flex-row">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-background px-5 font-semibold text-foreground"
                href={content.finalCta.primaryHref}
              >
                {content.finalCta.primaryLabel}
              </Link>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-primary-foreground/40 px-5 font-semibold"
                href={content.finalCta.secondaryHref}
              >
                {content.finalCta.secondaryLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Heading({
  block,
  inverted = false,
}: {
  block: { eyebrow: string; heading: string; description: string };
  inverted?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      {block.eyebrow ? (
        <p
          className={`text-sm font-semibold uppercase tracking-[0.16em] ${inverted ? 'text-amber-300' : 'text-foreground'}`}
        >
          {block.eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {block.heading}
      </h2>
      {block.description ? (
        <p
          className={`mt-4 text-lg leading-8 ${inverted ? 'text-slate-300' : 'text-muted-foreground'}`}
        >
          {block.description}
        </p>
      ) : null}
    </div>
  );
}
function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Truck;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6">
      <Icon aria-hidden="true" className="h-7 w-7 text-primary" />
      <h3 className="mt-5 text-2xl font-semibold">{title}</h3>
      <p className="mt-2 leading-7 text-muted-foreground">{text}</p>
    </article>
  );
}
