import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PUBLIC_PAGE_CONTENT,
  DEFAULT_PUBLIC_PAGE_SEO,
  aboutPageContentSchema,
  parsePublicPageContent,
  publicAboutPageContentSchema,
  publicPageMutationSchema,
  savePublicPageDraftSchema,
} from './public-pages';

describe('public page validation', () => {
  it('accepts every approved bootstrap page and SEO record', () => {
    for (const [key, content] of Object.entries(DEFAULT_PUBLIC_PAGE_CONTENT)) {
      expect(() =>
        parsePublicPageContent(
          key as keyof typeof DEFAULT_PUBLIC_PAGE_CONTENT,
          content,
        ),
      ).not.toThrow();
      expect(
        DEFAULT_PUBLIC_PAGE_SEO[key as keyof typeof DEFAULT_PUBLIC_PAGE_SEO]
          .title.length,
      ).toBeGreaterThan(0);
    }
  });

  it('rejects raw HTML and unsafe external CTA URLs', () => {
    const content = structuredClone(DEFAULT_PUBLIC_PAGE_CONTENT.ABOUT);
    content.hero.title = '<script>alert(1)</script>';
    expect(aboutPageContentSchema.safeParse(content).success).toBe(false);
    content.hero.title = 'Safe title';
    content.hero.primaryCta = { label: 'Unsafe', href: 'https://evil.example' };
    expect(aboutPageContentSchema.safeParse(content).success).toBe(false);
  });

  it('makes the public media contract reject internal media references', () => {
    const content = structuredClone(
      DEFAULT_PUBLIC_PAGE_CONTENT.ABOUT,
    ) as unknown as Record<string, unknown>;
    expect(publicAboutPageContentSchema.safeParse(content).success).toBe(false);
  });

  it('requires bounded optimistic and idempotent mutation metadata', () => {
    expect(
      publicPageMutationSchema.safeParse({
        expectedLockVersion: -1,
        operationId: 'bad',
      }).success,
    ).toBe(false);
    expect(
      savePublicPageDraftSchema.safeParse({
        expectedLockVersion: 0,
        operationId: crypto.randomUUID(),
        content: {},
        seo: DEFAULT_PUBLIC_PAGE_SEO.ABOUT,
        extra: true,
      }).success,
    ).toBe(false);
  });
});
