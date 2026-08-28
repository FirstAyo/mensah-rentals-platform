import type { Metadata } from 'next';
import { ArrowRight, Check, PackageSearch } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { breadcrumbJsonLd } from '@/components/breadcrumbs';
import { PublicPageHero } from '@/components/public-page-hero';
import { getPublicFeatures } from '@/lib/public-features';
import { getPublishedPublicPage } from '@/lib/public-pages';

export const dynamic = 'force-dynamic';
import { publicPageRobots, siteOrigin } from '@/lib/site-config';
import { companyPageJsonLd, serializeJsonLd } from '@/lib/structured-data';

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getPublishedPublicPage('ABOUT');
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: '/about' },
    openGraph: {
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      url: '/about',
      images: seo.socialImage.imageUrl ? [seo.socialImage.imageUrl] : undefined,
    },
    twitter: {
      card: seo.socialImage.imageUrl ? 'summary_large_image' : 'summary',
      title: seo.socialTitle || seo.title,
      description: seo.socialDescription || seo.description,
      images: seo.socialImage.imageUrl ? [seo.socialImage.imageUrl] : undefined,
    },
    robots: publicPageRobots(),
  };
}

export default async function AboutPage() {
  const [page, features] = await Promise.all([
    getPublishedPublicPage('ABOUT'),
    getPublicFeatures(),
  ]);
  if (page.key !== 'ABOUT') throw new Error('Unexpected page content.');
  const c = page.content;
  const origin = siteOrigin();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            companyPageJsonLd(origin, '/about', page.seo.title, 'AboutPage'),
          ),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd(
              [{ href: '/', label: 'Home' }, { label: 'About' }],
              origin,
            ),
          ),
        }}
        type="application/ld+json"
      />
      <PublicPageHero
        hero={c.hero}
        page="about"
        rentalRequests={features.rentalRequests}
      />
      {c.introduction.visible ? (
        <section className="mx-auto grid max-w-[1600px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <Eyebrow>{c.introduction.eyebrow}</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              {c.introduction.title}
            </h2>
            <p className="mt-6 whitespace-pre-line text-lg leading-8 text-muted-foreground">
              {c.introduction.body}
            </p>
          </div>
          <EditorialImage
            image={c.introduction.image}
            className="aspect-[4/3]"
          />
        </section>
      ) : null}
      {c.audiences.visible ? (
        <section className="border-y border-border bg-muted/35 py-16 lg:py-24">
          <div className="mx-auto max-w-[1760px] px-4 sm:px-6 lg:px-8">
            <Eyebrow>{c.audiences.eyebrow}</Eyebrow>
            <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
              {c.audiences.title}
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {c.audiences.items.map((item) => {
                const card = (
                  <>
                    <EditorialImage
                      image={item.image}
                      className="aspect-[4/3] rounded-none"
                    />
                    <div className="p-6">
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                      <p className="mt-2 leading-7 text-muted-foreground">
                        {item.description}
                      </p>
                      {item.href ? (
                        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                          Explore <ArrowRight className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </>
                );
                return item.href ? (
                  <Link
                    className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none"
                    href={item.href}
                    key={item.title}
                  >
                    {card}
                  </Link>
                ) : (
                  <article
                    className="overflow-hidden rounded-3xl border border-border bg-card"
                    key={item.title}
                  >
                    {card}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
      {c.benefits.visible ? (
        <section className="mx-auto max-w-[1500px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
            <div>
              <Eyebrow>{c.benefits.eyebrow}</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                {c.benefits.title}
              </h2>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {c.benefits.items.map((item) => (
                <div
                  className="grid gap-3 py-7 sm:grid-cols-[2rem_1fr]"
                  key={item.title}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {c.process.visible ? (
        <section
          className="bg-neutral-950 py-16 text-white lg:py-24"
          id="how-it-works"
        >
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
            <Eyebrow inverted>{c.process.eyebrow}</Eyebrow>
            <h2 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">
              {c.process.title}
            </h2>
            <ol className="mt-12 grid gap-0 md:grid-cols-2 xl:grid-cols-4">
              {c.process.items.map((item, index) => (
                <li
                  className="relative border-l border-white/20 py-2 pl-6 pr-8 md:min-h-48"
                  key={item.title}
                >
                  <span className="text-sm font-bold text-amber-300">
                    0{index + 1}
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold">{item.title}</h3>
                  <p className="mt-3 leading-7 text-white/65">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}
      {c.statement.visible ? (
        <section className="mx-auto grid max-w-[1600px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-28">
          <EditorialImage
            image={c.statement.image}
            className="aspect-[16/11]"
          />
          <div className="max-w-xl lg:pl-10">
            <PackageSearch className="h-9 w-9 text-primary" />
            <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              {c.statement.title}
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {c.statement.description}
            </p>
          </div>
        </section>
      ) : null}
      {c.finalCta.visible ? (
        <section className="border-t border-border bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-8 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {c.finalCta.title}
              </h2>
              <p className="mt-3 max-w-2xl text-white">
                {c.finalCta.description}
              </p>
            </div>
            <div className="flex flex-col gap-3 min-[380px]:flex-row">
              <Cta {...c.finalCta.primaryCta} primary />
              {c.finalCta.secondaryCta ? (
                <Cta {...c.finalCta.secondaryCta} />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Eyebrow({
  children,
  inverted = false,
}: {
  children: React.ReactNode;
  inverted?: boolean;
}) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.2em] ${inverted ? 'text-amber-300' : 'text-foreground'}`}
    >
      {children}
    </p>
  );
}
function EditorialImage({
  image,
  className,
}: {
  image: {
    imageUrl: string | null;
    altText: string;
    focalPoint: 'left' | 'center' | 'right';
  };
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] bg-muted ${className}`}
    >
      {image.imageUrl ? (
        <Image
          alt={image.altText}
          className={`object-cover ${image.focalPoint === 'left' ? 'object-left' : image.focalPoint === 'right' ? 'object-right' : 'object-center'}`}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          src={image.imageUrl}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-950" />
      )}
    </div>
  );
}
function Cta({
  label,
  href,
  primary = false,
}: {
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${primary ? 'bg-background text-foreground' : 'border border-primary-foreground/35'}`}
      href={href}
    >
      {label}
    </Link>
  );
}
