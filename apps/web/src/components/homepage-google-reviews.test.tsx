import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOMEPAGE_CONTENT } from '@mensah-rentals/validation';

const { getPublicGoogleReviews } = vi.hoisted(() => ({
  getPublicGoogleReviews: vi.fn(),
}));
vi.mock('@/lib/public-google-reviews', () => ({ getPublicGoogleReviews }));

import {
  HomepageGoogleReviews,
  HomepageGoogleReviewsFallback,
} from './homepage-google-reviews';

const section = DEFAULT_HOMEPAGE_CONTENT.reviews;
const links = {
  reviewsUrl: 'https://www.google.com/maps/reviews/mensah',
  writeReviewUrl: 'https://www.google.com/maps/reviews/write',
};
const reviews = [1, 2, 3].map((number) => ({
  rating: number === 3 ? 4 : 5,
  text: `Faithful review text ${number}`,
  originalText: null,
  translated: false,
  relativePublishTimeDescription: `${number} months ago`,
  publishTime: `2026-0${number}-01T12:00:00Z`,
  googleMapsUri: `https://www.google.com/maps/reviews/${number}`,
  flagContentUri: null,
  visitDate: null,
  author: {
    displayName: `Reviewer ${number}`,
    uri: `https://www.google.com/maps/contrib/${number}`,
    photoUri: `https://lh3.googleusercontent.com/reviewer-${number}`,
  },
}));

describe('homepage Google Reviews section', () => {
  beforeEach(() => {
    getPublicGoogleReviews.mockResolvedValue({
      status: 'LIVE',
      businessName: 'Mensah Rentals',
      rating: 4.8,
      reviewCount: 42,
      googleMapsUri: 'https://www.google.com/maps/place/mensah',
      reviews,
      orderingNotice:
        'Reviews are selected and ordered by Google Maps based on relevance.',
      reviewsUrl: links.reviewsUrl,
      writeReviewUrl: links.writeReviewUrl,
    });
  });

  it('renders live rating, count, faithful review content and full attribution', async () => {
    const html = renderToStaticMarkup(
      await HomepageGoogleReviews({ section, links }),
    );
    expect(html).toContain('4.8');
    expect(html).toContain('42 Google Maps reviews');
    expect(html).toContain('Faithful review text 1');
    expect(html).toContain('Reviewer 1');
    expect(html).toContain('reviewer-1');
    expect(html).toContain('View this review on Google Maps');
    expect(html).toContain(
      'Reviews are selected and ordered by Google Maps based on relevance.',
    );
    expect(html).toContain('Content provided by');
    expect(html.match(/<article/g)).toHaveLength(3);
  });

  it('renders a truthful fallback with links and no invented rating or cards', () => {
    const html = renderToStaticMarkup(
      <HomepageGoogleReviewsFallback links={links} section={section} />,
    );
    expect(html).toContain(section.heading);
    expect(html).toContain(section.description);
    expect(html).toContain('Read reviews on Google Maps');
    expect(html).toContain('Leave a review');
    expect(html).not.toContain('<article');
    expect(html).not.toMatch(/out of 5|Google Maps reviews/);
  });

  it('falls back safely when the backend cannot provide live content', async () => {
    getPublicGoogleReviews.mockResolvedValue({
      status: 'UNAVAILABLE',
      fallbackMessage: 'Safe fallback',
      reviewsUrl: null,
      writeReviewUrl: null,
    });
    const html = renderToStaticMarkup(
      await HomepageGoogleReviews({ section, links }),
    );
    expect(html).toContain(section.description);
    expect(html).not.toContain('Faithful review text');
  });
});
