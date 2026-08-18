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
    () => new Set([0]),
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
    // The current image is already rendered by the browser. Preserve that
    // knowledge when the responsive source set changes so returning to it is
    // never blocked by a cached image load event that fired before hydration.
    setLoadedSlides(new Set([index]));
    // `index` intentionally is not a dependency: normal slide changes retain
    // every image confirmed during this responsive source set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileViewport, slides]);

  useEffect(() => {
    if (slides.length < 2) return;
    let cancelled = false;
    const nextIndex = (index + 1) % slides.length;
    if (loadedSlides.has(nextIndex)) return;
    const nextSlide = slides[nextIndex];
    if (!nextSlide) return;
    const image = new Image();
    const markLoaded = () => {
      if (cancelled) return;
      setLoadedSlides((current) => new Set(current).add(nextIndex));
    };
    image.onload = markLoaded;
    image.onerror = () => undefined;
    image.src =
      mobileViewport && nextSlide.mobileUrl
        ? nextSlide.mobileUrl
        : nextSlide.desktopUrl;
    if (image.complete && image.naturalWidth > 0) markLoaded();
    return () => {
      cancelled = true;
    };
  }, [index, loadedSlides, mobileViewport, slides]);

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
      className="relative isolate min-h-[34rem] overflow-hidden border-b border-white/10 bg-slate-950 text-white min-[380px]:min-h-[36rem] sm:min-h-[40rem] lg:min-h-[42rem]"
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
                fetchPriority={slideIndex === 0 ? 'high' : 'auto'}
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
      <div className="mx-auto flex min-h-[34rem] max-w-[1760px] items-center px-4 pb-24 pt-12 min-[380px]:min-h-[36rem] sm:min-h-[40rem] sm:px-6 sm:pb-24 sm:pt-20 lg:min-h-[42rem] lg:px-8">
        <div className="max-w-4xl">
          {hero.eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
              {hero.eyebrow}
            </p>
          ) : null}
          <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:mt-5 sm:text-6xl lg:text-7xl lg:leading-[1.02]">
            {hero.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:mt-6 sm:text-xl sm:leading-8">
            {hero.description}
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-3">
            <Link
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 font-semibold text-slate-950 outline-none hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-white sm:min-h-12 sm:w-auto sm:px-5"
              href={hero.primaryHref}
            >
              {hero.primaryLabel}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/35 bg-white/10 px-4 font-semibold outline-none backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white sm:min-h-12 sm:w-auto sm:px-5"
              href={hero.secondaryHref}
            >
              {hero.secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
      {slides.length > 1 ? (
        <div
          aria-label="Slideshow controls"
          className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-slate-950/55 p-1 shadow-lg backdrop-blur-md sm:bottom-5 sm:gap-1 sm:p-1.5"
          data-hero-controls="true"
          role="group"
        >
          <button
            aria-label="Previous slide"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50 sm:h-11 sm:w-11"
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
              className="grid h-10 w-9 shrink-0 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50 sm:h-11 sm:w-10"
              disabled={!loadedSlides.has(slideIndex)}
              key={slideIndex}
              onClick={() => showSlide(slideIndex)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full border border-white transition-[width,background-color] ${slideIndex === index ? 'w-5 bg-white' : 'w-2 bg-transparent'}`}
              />
            </button>
          ))}
          <button
            aria-label="Next slide"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50 sm:h-11 sm:w-11"
            disabled={!loadedSlides.has((index + 1) % slides.length)}
            onClick={() => showSlide((index + 1) % slides.length)}
            type="button"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
            className="ml-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border-l border-white/15 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white sm:ml-1 sm:h-11 sm:w-11"
            onClick={() => setPaused((value) => !value)}
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
