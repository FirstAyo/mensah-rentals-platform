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
import {
  HomepageGoogleReviews,
  HomepageGoogleReviewsFallback,
} from '@/components/homepage-google-reviews';
import { ProductCard } from '@/components/product-card';
import { getPublicHomepage } from '@/lib/public-homepage';

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
    };
  } catch {
    return { title: 'Mensah Rentals', alternates: { canonical: '/' } };
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
  const { content, categories, products, googleReviews } =
    await getPublicHomepage();
  return (
    <>
      <HomepageHero hero={content.hero} />
      <ul
        aria-label="Rental reassurance"
        className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4"
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

      {content.featuredCategories.enabled && categories.length ? (
        <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Heading block={content.featuredCategories} />
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
      ) : null}

      {content.benefits.enabled ? (
        <section className="border-y border-border bg-muted/45">
          <div className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
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

      {content.featuredProducts.enabled && products.length ? (
        <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
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

      {content.process.enabled ? (
        <section
          className="border-y border-border bg-slate-950 text-white"
          id="how-it-works"
        >
          <div className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
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

      {content.solutions.enabled ? (
        <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Heading block={content.solutions} />
          <div className="mt-9 grid gap-4 sm:grid-cols-2">
            {content.solutions.items
              .filter((item) => item.enabled)
              .map((item) => {
                return (
                  <Link
                    className="group relative min-h-80 overflow-hidden rounded-3xl bg-slate-900 p-7 text-white"
                    href={item.href}
                    key={item.title}
                  >
                    {item.imageUrl ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                        style={{ backgroundImage: `url(${item.imageUrl})` }}
                      />
                    ) : null}
                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/20" />
                    <span className="relative flex h-full flex-col justify-end">
                      <h3 className="text-3xl font-bold">{item.title}</h3>
                      <p className="mt-2 max-w-xl text-slate-200">
                        {item.description}
                      </p>
                    </span>
                  </Link>
                );
              })}
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
        <section className="relative mx-auto grid max-w-[1760px] gap-8 overflow-hidden px-4 py-16 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:py-24">
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
          <div className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8">
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

      <section className="mx-auto max-w-[1760px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
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
