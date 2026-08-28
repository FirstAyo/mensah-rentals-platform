import Image from 'next/image';
import Link from 'next/link';

import { Breadcrumbs } from './breadcrumbs';

type Hero = {
  eyebrow: string;
  title: string;
  description: string;
  image: {
    imageUrl: string | null;
    altText: string;
    focalPoint: 'left' | 'center' | 'right';
  };
  primaryCta?: { label: string; href: string } | null;
  secondaryCta?: { label: string; href: string } | null;
};

const position = {
  left: 'object-left',
  center: 'object-center',
  right: 'object-right',
};

export function PublicPageHero({
  hero,
  page,
  compact = false,
  rentalRequests = true,
  meta,
}: {
  hero: Hero;
  page: 'about' | 'contact' | 'terms' | 'privacy';
  compact?: boolean;
  rentalRequests?: boolean;
  meta?: string;
}) {
  const primary = featureAwareCta(hero.primaryCta, rentalRequests);
  const secondary = featureAwareCta(hero.secondaryCta, rentalRequests);
  const overlay = {
    about:
      'bg-[linear-gradient(90deg,rgba(10,10,9,.80)_0%,rgba(10,10,9,.62)_50%,rgba(10,10,9,.22)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(10,10,9,.52)_0%,rgba(10,10,9,.64)_100%)]',
    contact:
      'bg-[linear-gradient(90deg,rgba(30,21,13,.73)_0%,rgba(30,21,13,.48)_56%,rgba(30,21,13,.20)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(30,21,13,.44)_0%,rgba(30,21,13,.57)_100%)]',
    terms:
      'bg-[linear-gradient(90deg,rgba(12,12,12,.78)_0%,rgba(12,12,12,.60)_68%,rgba(12,12,12,.36)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(12,12,12,.50)_0%,rgba(12,12,12,.62)_100%)]',
    privacy:
      'bg-[linear-gradient(90deg,rgba(10,18,20,.80)_0%,rgba(10,18,20,.58)_68%,rgba(10,18,20,.32)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(10,18,20,.48)_0%,rgba(10,18,20,.61)_100%)]',
  }[page];
  return (
    <section
      className={`relative isolate overflow-hidden bg-neutral-900 text-white ${compact ? 'min-h-[21rem] lg:min-h-[24rem]' : 'min-h-[31rem] lg:min-h-[35rem]'}`}
      data-page-hero={page}
    >
      {hero.image.imageUrl ? (
        <Image
          alt={hero.image.altText}
          className={`object-cover ${position[hero.image.focalPoint]}`}
          fill
          priority
          sizes="100vw"
          src={hero.image.imageUrl}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_35%,rgba(217,153,53,.28),transparent_35%),linear-gradient(135deg,#292724,#111)]" />
      )}
      <div className={`absolute inset-0 ${overlay}`} data-overlay />
      <div className="relative mx-auto flex min-h-[inherit] max-w-[1760px] flex-col px-4 pb-12 pt-7 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20 lg:pt-9">
        <Breadcrumbs
          items={[{ href: '/', label: 'Home' }, { label: pageLabel(page) }]}
        />
        <div className={`mt-auto max-w-4xl ${compact ? 'pt-16' : 'pt-20'}`}>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300 sm:text-sm">
            {hero.eyebrow}
          </p>
          <h1
            className={`mt-4 font-bold tracking-[-0.035em] text-white ${compact ? 'text-4xl sm:text-5xl lg:text-6xl' : 'text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-7xl'}`}
          >
            {hero.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/84 sm:text-lg sm:leading-8 lg:text-xl">
            {hero.description}
          </p>
          {meta ? (
            <p className="mt-4 text-sm font-medium text-white/70">{meta}</p>
          ) : null}
          {primary || secondary ? (
            <div className="mt-8 flex flex-col gap-3 min-[380px]:flex-row">
              {primary ? <HeroLink cta={primary} primary /> : null}
              {secondary ? <HeroLink cta={secondary} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HeroLink({
  cta,
  primary = false,
}: {
  cta: { label: string; href: string };
  primary?: boolean;
}) {
  return (
    <Link
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-amber-300 ${primary ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300' : 'border border-white/35 bg-black/20 text-white backdrop-blur-sm hover:bg-white/12'}`}
      href={cta.href}
    >
      {cta.label}
    </Link>
  );
}

function featureAwareCta(
  cta: { label: string; href: string } | null | undefined,
  rentalRequests: boolean,
) {
  if (!cta) return null;
  if (
    !rentalRequests &&
    (/rental-request|\/cart/.test(cta.href) || /request/i.test(cta.label))
  )
    return { label: 'Contact us', href: '/contact' };
  return cta;
}

function pageLabel(page: 'about' | 'contact' | 'terms' | 'privacy') {
  return page === 'about'
    ? 'About'
    : page === 'contact'
      ? 'Contact'
      : page === 'terms'
        ? 'Terms'
        : 'Privacy';
}
