'use client';

import { ArrowDown, Pause, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type RentalCatalogueHeroSlide = {
  focalPoint: string;
  name: string;
  url: string;
};

export function RentalCatalogueHero({
  slides,
}: {
  slides: RentalCatalogueHeroSlide[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || focusWithin || hovered || reducedMotion)
      return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % slides.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [focusWithin, hovered, paused, reducedMotion, slides.length]);

  return (
    <section
      aria-label="Rental catalogue introduction"
      className="relative isolate min-h-[30rem] overflow-hidden border-b border-border bg-slate-950 text-white sm:min-h-[34rem] lg:min-h-[38rem]"
      data-rentals-hero="true"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusWithin(false);
      }}
      onFocusCapture={() => setFocusWithin(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_80%_20%,rgba(245,158,11,.28),transparent_38%),linear-gradient(135deg,#111827,#020617)]"
      />
      {slides.map((slide, slideIndex) => (
        <div
          aria-hidden="true"
          className={`absolute inset-0 -z-20 transition-opacity duration-1000 motion-reduce:transition-none ${slideIndex === index ? 'opacity-100' : 'opacity-0'}`}
          key={`${slide.url}-${slideIndex}`}
        >
          {/* Category imagery is decorative here; the visible heading carries the page meaning. */}
          <Image
            alt=""
            className="object-cover"
            fill
            priority={slideIndex === 0}
            sizes="100vw"
            src={slide.url}
            style={{ objectPosition: slide.focalPoint }}
          />
        </div>
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,6,23,.60),rgba(2,6,23,.78))] md:bg-[linear-gradient(90deg,rgba(2,6,23,.90)_0%,rgba(2,6,23,.68)_55%,rgba(2,6,23,.38)_100%)]"
      />

      <div className="public-container flex min-h-[30rem] items-center py-16 sm:min-h-[34rem] sm:py-20 lg:min-h-[38rem]">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
            Rental catalogue
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-6xl lg:text-7xl lg:leading-[1.02]">
            Equipment for events, productions, and projects
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-xl sm:leading-8">
            Explore equipment for your project and build a list at your own
            pace. Our team reviews quantities and prepares custom pricing
            privately.
          </p>
          <Link
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 font-semibold text-slate-950 outline-none transition hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
            href="#catalogue-categories"
          >
            Browse categories
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {slides.length > 1 ? (
        <div
          aria-label="Catalogue hero controls"
          className="absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/20 bg-slate-950/60 p-1.5 shadow-lg backdrop-blur-md"
          role="group"
        >
          {slides.map((slide, slideIndex) => (
            <button
              aria-current={slideIndex === index ? 'true' : undefined}
              aria-label={`Show ${slide.name} category image`}
              className="grid h-10 w-9 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white"
              key={`${slide.name}-${slideIndex}`}
              onClick={() => setIndex(slideIndex)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full border border-white transition-[width,background-color] motion-reduce:transition-none ${slideIndex === index ? 'w-5 bg-white' : 'w-2 bg-transparent'}`}
              />
            </button>
          ))}
          <button
            aria-label={
              paused ? 'Play catalogue slideshow' : 'Pause catalogue slideshow'
            }
            className="ml-1 grid h-10 w-10 place-items-center rounded-xl border-l border-white/15 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => setPaused((current) => !current)}
            type="button"
          >
            {paused ? (
              <Play aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Pause aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}
