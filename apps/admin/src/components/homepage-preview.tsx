'use client';

import { useEffect, useState } from 'react';
import type { HomepageContent } from '@mensah-rentals/validation';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { adminHomepageMediaUrl } from '@/lib/homepage-media-url';

type Media = {
  id: string;
  source: 'HOMEPAGE' | 'PRODUCT';
  url: string;
  description: string;
};

function previewMediaUrl(media: Media) {
  return media.source === 'PRODUCT' ? media.url : adminHomepageMediaUrl(media);
}
type Revision = {
  content: HomepageContent;
  featuredCategoryIds: string[];
  featuredProductIds: string[];
  media: Media[];
};
type CatalogueItem = { id: string; name: string };

export function HomepagePreview({ revisionId }: { revisionId: string }) {
  const [revision, setRevision] = useState<Revision | null>(null);
  const [categories, setCategories] = useState<CatalogueItem[]>([]);
  const [products, setProducts] = useState<CatalogueItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      fetch(`/api/homepage/revisions/${revisionId}/preview`, {
        cache: 'no-store',
      }),
      fetch(
        '/api/catalogue/categories?page=1&pageSize=100&sortBy=sortOrder&sortDirection=asc',
        { cache: 'no-store' },
      ),
      fetch(
        '/api/catalogue/products?page=1&pageSize=100&sortBy=name&sortDirection=asc',
        { cache: 'no-store' },
      ),
    ])
      .then(async ([home, cats, prods]) => {
        if (!home.ok) throw new Error('Preview is unavailable.');
        setRevision(await home.json());
        if (cats.ok) setCategories((await cats.json()).items ?? []);
        if (prods.ok) setProducts((await prods.json()).items ?? []);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Preview is unavailable.',
        ),
      );
  }, [revisionId]);
  if (error) return <p>{error}</p>;
  if (!revision) return <p>Loading secure preview…</p>;
  const { content } = revision;
  const media = new Map(revision.media.map((item) => [item.id, item]));
  const names = (ids: string[], values: CatalogueItem[]) =>
    ids.map((id) => values.find((item) => item.id === id)?.name ?? id);
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-background">
      <PreviewHero hero={content.hero} media={media} />
      <ul className="grid border-b border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {content.trustItems
          .filter((item) => item.enabled)
          .map((item) => (
            <li
              className="px-4 py-5 text-center text-sm font-medium"
              key={item.label}
            >
              {item.label}
            </li>
          ))}
      </ul>

      <div className="grid gap-12 p-5 sm:p-10 lg:p-16">
        {content.featuredCategories.enabled ? (
          <PreviewCards
            eyebrow={content.featuredCategories.eyebrow}
            heading={content.featuredCategories.heading}
            description={content.featuredCategories.description}
            items={names(revision.featuredCategoryIds, categories)}
          />
        ) : null}
        {content.benefits.enabled ? (
          <PreviewCards
            eyebrow={content.benefits.eyebrow}
            heading={content.benefits.heading}
            description={content.benefits.description}
            items={content.benefits.items
              .filter((item) => item.enabled)
              .map((item) => `${item.title} — ${item.description}`)}
          />
        ) : null}
        {content.featuredProducts.enabled ? (
          <PreviewCards
            eyebrow={content.featuredProducts.eyebrow}
            heading={content.featuredProducts.heading}
            description={content.featuredProducts.description}
            items={names(revision.featuredProductIds, products)}
          />
        ) : null}
        {content.process.enabled ? (
          <PreviewCards
            dark
            eyebrow={content.process.eyebrow}
            heading={content.process.heading}
            description={content.process.description}
            items={content.process.steps.map(
              (item, index) =>
                `${index + 1}. ${item.title} — ${item.description}`,
            )}
          />
        ) : null}
        {content.solutions.enabled ? (
          <section>
            <PreviewHeading block={content.solutions} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {content.solutions.items
                .filter((item) => item.enabled)
                .map((item) => {
                  const image = item.mediaId ? media.get(item.mediaId) : null;
                  return (
                    <article
                      className="relative min-h-64 overflow-hidden rounded-2xl bg-slate-950 p-6 text-white"
                      key={item.title}
                    >
                      {image ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 bg-cover bg-center opacity-45"
                          style={{
                            backgroundImage: `url(${previewMediaUrl(image)})`,
                          }}
                        />
                      ) : null}
                      <span className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent" />
                      <div className="relative flex h-full flex-col justify-end">
                        <h3 className="text-2xl font-bold">{item.title}</h3>
                        <p className="mt-2 text-slate-200">
                          {item.description}
                        </p>
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        ) : null}
        {content.reviews.enabled ? (
          <PreviewCards
            eyebrow={content.reviews.eyebrow}
            heading={content.reviews.heading}
            description={content.reviews.description}
            items={['Google review links (when configured)']}
          />
        ) : null}
        {content.pickupDelivery.enabled ? (
          <section className="relative overflow-hidden rounded-2xl p-6">
            {content.pickupDelivery.mediaId &&
            media.get(content.pickupDelivery.mediaId) ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center opacity-10"
                style={{
                  backgroundImage: `url(${previewMediaUrl(media.get(content.pickupDelivery.mediaId)!)})`,
                }}
              />
            ) : null}
            <div className="relative">
              <PreviewHeading block={content.pickupDelivery} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold">
                    {content.pickupDelivery.pickupTitle}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {content.pickupDelivery.pickupDescription}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold">
                    {content.pickupDelivery.deliveryTitle}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {content.pickupDelivery.deliveryDescription}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {content.serviceAreas.enabled ? (
          <PreviewCards
            eyebrow={content.serviceAreas.eyebrow}
            heading={content.serviceAreas.heading}
            description={content.serviceAreas.description}
            items={content.serviceAreas.areas
              .filter((item) => item.enabled)
              .map((item) => item.label)}
          />
        ) : null}
        <section className="relative overflow-hidden rounded-xl bg-primary p-8 text-primary-foreground">
          {content.finalCta.mediaId && media.get(content.finalCta.mediaId) ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{
                backgroundImage: `url(${previewMediaUrl(media.get(content.finalCta.mediaId)!)})`,
              }}
            />
          ) : null}
          <div className="relative">
            <h2 className="text-3xl font-bold">{content.finalCta.heading}</h2>
            <p className="mt-2">{content.finalCta.description}</p>
            <p className="mt-5 font-semibold">
              {content.finalCta.primaryLabel} ·{' '}
              {content.finalCta.secondaryLabel}
            </p>
          </div>
        </section>
      </div>
    </article>
  );
}

function PreviewHero({
  hero,
  media,
}: {
  hero: HomepageContent['hero'];
  media: Map<string, Media>;
}) {
  const slides = hero.slides.filter(
    (slide) => slide.enabled && media.has(slide.desktopMediaId),
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(!hero.autoplayEnabled);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % slides.length),
      hero.intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [hero.intervalMs, paused, reducedMotion, slides.length]);
  const active = slides[index];
  const desktop = active ? media.get(active.desktopMediaId) : null;
  const mobile = active?.mobileMediaId ? media.get(active.mobileMediaId) : null;
  return (
    <section
      aria-label="Homepage hero preview"
      className="relative min-h-[34rem] overflow-hidden bg-slate-950 px-5 py-20 text-white sm:px-10 lg:px-16"
    >
      {desktop ? (
        <picture>
          {mobile ? (
            <source
              media="(max-width: 767px)"
              srcSet={previewMediaUrl(mobile)}
            />
          ) : null}
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={previewMediaUrl(desktop)}
            style={{ objectPosition: active?.focalPoint }}
          />
        </picture>
      ) : null}
      <span
        className={`absolute inset-0 ${
          hero.overlayIntensity === 'LIGHT'
            ? 'bg-slate-950/5'
            : 'bg-slate-950/10'
        }`}
      />
      <span
        className={`absolute inset-0 bg-gradient-to-b ${
          hero.overlayIntensity === 'LIGHT'
            ? 'from-slate-950/45 via-slate-950/40 to-slate-950/45 md:bg-gradient-to-r md:from-slate-950/55 md:via-slate-950/40 md:to-slate-950/15 lg:from-slate-950/60 lg:via-slate-950/35 lg:to-slate-950/10'
            : hero.overlayIntensity === 'MEDIUM'
              ? 'from-slate-950/50 via-slate-950/45 to-slate-950/50 md:bg-gradient-to-r md:from-slate-950/60 md:via-slate-950/45 md:to-slate-950/20 lg:from-slate-950/70 lg:via-slate-950/45 lg:to-slate-950/20'
              : 'from-slate-950/55 via-slate-950/50 to-slate-950/55 md:bg-gradient-to-r md:from-slate-950/65 md:via-slate-950/50 md:to-slate-950/20 lg:from-slate-950/75 lg:via-slate-950/50 lg:to-slate-950/20'
        }`}
      />
      <div className="relative max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
          {hero.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
          {hero.heading}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-200">
          {hero.description}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <span className="rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-950">
            {hero.primaryLabel}
          </span>
          <span className="rounded-lg border border-white/40 px-5 py-3 font-semibold">
            {hero.secondaryLabel}
          </span>
        </div>
      </div>
      {slides.length > 1 ? (
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-slate-950/75 p-2">
          <button
            aria-label="Previous hero image"
            className="grid h-11 w-11 place-items-center rounded-full"
            onClick={() =>
              setIndex(
                (current) => (current - 1 + slides.length) % slides.length,
              )
            }
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            aria-label={paused ? 'Play hero images' : 'Pause hero images'}
            className="grid h-11 w-11 place-items-center rounded-full"
            onClick={() => setPaused((current) => !current)}
            type="button"
          >
            {paused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
          <button
            aria-label="Next hero image"
            className="grid h-11 w-11 place-items-center rounded-full"
            onClick={() => setIndex((current) => (current + 1) % slides.length)}
            type="button"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PreviewHeading({
  block,
}: {
  block: { eyebrow: string; heading: string; description: string };
}) {
  return (
    <div>
      <p className="text-sm font-medium text-primary">{block.eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold">{block.heading}</h2>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        {block.description}
      </p>
    </div>
  );
}

function PreviewCards({
  eyebrow,
  heading,
  description,
  items,
  dark = false,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  items: string[];
  dark?: boolean;
}) {
  return (
    <section className={dark ? 'rounded-2xl bg-slate-950 p-6 text-white' : ''}>
      <p
        className={`text-sm font-medium ${dark ? 'text-amber-300' : 'text-primary'}`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold">{heading}</h2>
      <p
        className={`mt-2 max-w-3xl ${dark ? 'text-slate-300' : 'text-muted-foreground'}`}
      >
        {description}
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <li
            className="rounded-xl border border-border bg-card p-4 text-card-foreground"
            key={`${item}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
