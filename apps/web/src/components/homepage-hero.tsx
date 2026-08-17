'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicHomepageContent } from '@mensah-rentals/validation';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import Link from 'next/link';

const heroOverlayClasses = {
  LIGHT: {
    tint: 'bg-slate-950/5',
    gradient:
      'bg-gradient-to-b from-slate-950/45 via-slate-950/40 to-slate-950/45 md:bg-gradient-to-r md:from-slate-950/55 md:via-slate-950/40 md:to-slate-950/15 lg:from-slate-950/60 lg:via-slate-950/35 lg:to-slate-950/10',
  },
  MEDIUM: {
    tint: 'bg-slate-950/10',
    gradient:
      'bg-gradient-to-b from-slate-950/50 via-slate-950/45 to-slate-950/50 md:bg-gradient-to-r md:from-slate-950/60 md:via-slate-950/45 md:to-slate-950/20 lg:from-slate-950/70 lg:via-slate-950/45 lg:to-slate-950/20',
  },
  STRONG: {
    tint: 'bg-slate-950/10',
    gradient:
      'bg-gradient-to-b from-slate-950/55 via-slate-950/50 to-slate-950/55 md:bg-gradient-to-r md:from-slate-950/65 md:via-slate-950/50 md:to-slate-950/20 lg:from-slate-950/75 lg:via-slate-950/50 lg:to-slate-950/20',
  },
} as const;

export function HomepageHero({
  hero,
}: {
  hero: PublicHomepageContent['hero'];
}) {
  const slides = useMemo(
    () => hero.slides.filter((slide) => slide.enabled),
    [hero.slides],
  );
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(true);
  const [paused, setPaused] = useState(!hero.autoplayEnabled);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [loadedSlides, setLoadedSlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const section = useRef<HTMLElement>(null);
  const overlayClasses = heroOverlayClasses[hero.overlayIntensity];

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileViewport(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    setLoadedSlides(new Set());
    slides.forEach((slide, slideIndex) => {
      const source =
        mobileViewport && slide.mobileUrl ? slide.mobileUrl : slide.desktopUrl;
      timers.push(
        window.setTimeout(
          () => {
            const image = new Image();
            const markLoaded = () => {
              if (cancelled) return;
              setLoadedSlides((current) => {
                if (current.has(slideIndex)) return current;
                const next = new Set(current);
                next.add(slideIndex);
                return next;
              });
            };
            image.onload = markLoaded;
            image.onerror = () => undefined;
            image.src = source;
            if (image.complete && image.naturalWidth > 0) markLoaded();
          },
          slideIndex === 0 ? 0 : slideIndex * 600,
        ),
      );
    });
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [mobileViewport, slides]);

  const showSlide = (next: number) => {
    if (next === index || !loadedSlides.has(next)) return;
    setPreviousIndex(index);
    setIncomingVisible(false);
    setIndex(next);
  };

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (previousIndex === null || !loadedSlides.has(index)) return;
    if (reducedMotion) {
      setIncomingVisible(true);
      setPreviousIndex(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => setIncomingVisible(true));
    const timer = window.setTimeout(() => setPreviousIndex(null), 750);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [index, loadedSlides, previousIndex, reducedMotion]);
  useEffect(() => {
    const update = () =>
      setDocumentHidden(document.visibilityState !== 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (
      slides.length < 2 ||
      paused ||
      hovered ||
      focusWithin ||
      reducedMotion ||
      documentHidden
    )
      return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        if (!loadedSlides.has(next)) return current;
        setPreviousIndex(current);
        setIncomingVisible(false);
        return next;
      });
    }, hero.intervalMs);
    return () => window.clearInterval(timer);
  }, [
    focusWithin,
    hero.intervalMs,
    hovered,
    paused,
    reducedMotion,
    documentHidden,
    loadedSlides,
    slides.length,
  ]);

  return (
    <section
      aria-label="Mensah Rentals introduction"
      className="relative isolate min-h-[38rem] overflow-hidden border-b border-white/10 bg-slate-950 text-white sm:min-h-[42rem]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusWithin(false);
      }}
      ref={section}
    >
      <div className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_78%_18%,rgba(245,158,11,.28),transparent_35%),radial-gradient(circle_at_12%_90%,rgba(16,185,129,.18),transparent_40%)]" />
      {slides.map((slide, slideIndex) => {
        if (slideIndex !== index && slideIndex !== previousIndex) return null;
        return (
          <div
            aria-hidden="true"
            className={`absolute inset-0 -z-20 transition-opacity duration-700 ${slideIndex === index && incomingVisible ? 'opacity-100' : slideIndex === previousIndex ? 'opacity-100' : 'opacity-0'} ${reducedMotion ? 'duration-0' : ''}`}
            data-hero-layer="image"
            key={`${slide.desktopUrl}-${slideIndex}`}
            style={{ zIndex: slideIndex === index ? -19 : -20 }}
          >
            <picture>
              {slide.mobileUrl ? (
                <source media="(max-width: 767px)" srcSet={slide.mobileUrl} />
              ) : null}
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading={slideIndex === 0 ? 'eager' : 'lazy'}
                onLoad={() =>
                  setLoadedSlides((current) => {
                    if (current.has(slideIndex)) return current;
                    const next = new Set(current);
                    next.add(slideIndex);
                    return next;
                  })
                }
                src={slide.desktopUrl}
                style={{ objectPosition: slide.focalPoint }}
              />
            </picture>
          </div>
        );
      })}
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 ${overlayClasses.tint}`}
        data-hero-overlay="tint"
      />
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 ${overlayClasses.gradient}`}
        data-hero-overlay="gradient"
      />
      <div className="mx-auto flex min-h-[38rem] max-w-[1760px] items-center px-4 py-20 sm:min-h-[42rem] sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          {hero.eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
              {hero.eyebrow}
            </p>
          ) : null}
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-6xl lg:text-7xl lg:leading-[1.02]">
            {hero.heading}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
            {hero.description}
          </p>
          <div className="mt-8 flex flex-col gap-3 min-[380px]:flex-row min-[380px]:flex-wrap">
            <Link
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 font-semibold text-slate-950 outline-none hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-white"
              href={hero.primaryHref}
            >
              {hero.primaryLabel}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/35 bg-white/10 px-5 font-semibold outline-none backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
              href={hero.secondaryHref}
            >
              {hero.secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
      {slides.length > 1 ? (
        <div className="absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-white/20 bg-slate-950/70 p-2 backdrop-blur">
          <button
            aria-label={paused ? 'Play hero images' : 'Pause hero images'}
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => setPaused((value) => !value)}
            type="button"
          >
            {paused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
          <button
            aria-label="Previous hero image"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50"
            disabled={
              !loadedSlides.has((index - 1 + slides.length) % slides.length)
            }
            onClick={() =>
              showSlide((index - 1 + slides.length) % slides.length)
            }
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {slides.map((_, slideIndex) => (
            <button
              aria-current={slideIndex === index ? 'true' : undefined}
              aria-label={`Show hero image ${slideIndex + 1} of ${slides.length}`}
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50"
              disabled={!loadedSlides.has(slideIndex)}
              key={slideIndex}
              onClick={() => showSlide(slideIndex)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full border border-white ${slideIndex === index ? 'bg-white' : 'bg-transparent'}`}
              />
            </button>
          ))}
          <button
            aria-label="Next hero image"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50"
            disabled={!loadedSlides.has((index + 1) % slides.length)}
            onClick={() => showSlide((index + 1) % slides.length)}
            type="button"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
