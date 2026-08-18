import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicHomepageContent } from '@mensah-rentals/validation';

import { HomepageHero } from './homepage-hero';

function hero(
  overlayIntensity: PublicHomepageContent['hero']['overlayIntensity'],
  slideCount = 1,
): PublicHomepageContent['hero'] {
  return {
    eyebrow: 'Professional equipment rentals',
    heading: 'Equipment and support for demanding projects',
    description: 'Tell us what your project needs and our team will review it.',
    primaryLabel: 'Browse rentals',
    primaryHref: '/rentals',
    secondaryLabel: 'How it works',
    secondaryHref: '/#how-it-works',
    autoplayEnabled: true,
    intervalMs: 7000,
    overlayIntensity,
    slides: Array.from({ length: slideCount }, (_, index) => ({
      description: 'A bright outdoor equipment scene',
      focalPoint: 'center',
      enabled: true,
      desktopUrl: `/media/hero-desktop-${index}.webp`,
      mobileUrl: `/media/hero-mobile-${index}.webp`,
    })),
  };
}

describe('HomepageHero overlay', () => {
  it.each(['LIGHT', 'MEDIUM', 'STRONG'] as const)(
    'keeps the %s overlay above every hero image',
    (overlayIntensity) => {
      const html = renderToStaticMarkup(
        <HomepageHero hero={hero(overlayIntensity)} />,
      );

      expect(html).toContain('data-hero-layer="image"');
      expect(html).toContain('style="z-index:-19"');
      expect(html.match(/data-hero-overlay=/g)).toHaveLength(2);
      expect(html).toContain('data-hero-overlay="tint"');
      expect(html).toContain('data-hero-overlay="gradient"');
      expect(html.match(/-z-10/g)).toHaveLength(2);
    },
  );

  it('uses a lighter mobile treatment, moderate tablet layer, and directional desktop gradient', () => {
    const html = renderToStaticMarkup(<HomepageHero hero={hero('STRONG')} />);

    expect(html).toContain('bg-slate-950/10');
    expect(html).toContain('bg-gradient-to-b');
    expect(html).toContain('from-slate-950/55');
    expect(html).toContain('via-slate-950/50');
    expect(html).toContain('to-slate-950/55');
    expect(html).toContain('md:bg-gradient-to-r');
    expect(html).toContain('md:from-slate-950/65');
    expect(html).toContain('md:via-slate-950/50');
    expect(html).toContain('md:to-slate-950/20');
    expect(html).toContain('lg:from-slate-950/75');
    expect(html).toContain('lg:via-slate-950/50');
    expect(html).toContain('lg:to-slate-950/20');
  });

  it('reserves mobile space and renders compact, labelled slideshow controls', () => {
    const html = renderToStaticMarkup(
      <HomepageHero hero={hero('STRONG', 3)} />,
    );

    expect(html).toContain('min-h-[34rem]');
    expect(html).toContain('pb-24');
    expect(html).toContain('data-hero-controls="true"');
    expect(html).toContain('aria-label="Previous slide"');
    expect(html).toContain('aria-label="Next slide"');
    expect(html).toContain('aria-label="Pause slideshow"');
    expect(html).toContain('h-10 w-10');
    expect(html).toContain('h-10 w-9');
    expect(html).not.toContain('flex-wrap items-center justify-center gap-2');
  });
});
