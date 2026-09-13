import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPublicGallery, getPublicGalleryProject } from './public-gallery';

const summary = {
  cover: {
    altText: 'Production equipment ready on site',
    focalPoint: 'center',
    url: `/media/homepage/project/${'a'.repeat(64)}.webp`,
  },
  eventDate: null,
  imageCount: 1,
  location: 'Richmond, BC',
  service: { label: 'Film Production', slug: 'film-production' },
  shortDescription: 'Equipment supporting a production.',
  slug: 'sample-production',
  title: 'Sample Production',
};

afterEach(() => vi.unstubAllGlobals());

describe('public Gallery server boundary', () => {
  it('accepts the explicit public list shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          items: [summary],
          selectedType: null,
          services: [summary.service],
        }),
      ),
    );
    await expect(getPublicGallery()).resolves.toMatchObject({
      items: [{ slug: 'sample-production' }],
    });
  });

  it('recursively rejects internal data in a public project', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...summary,
          description: null,
          media: [summary.cover],
          seo: {
            description: 'A project by Mensah Rentals.',
            title: 'Sample Production',
          },
          inventory: { available: 4 },
        }),
      ),
    );
    await expect(getPublicGalleryProject(summary.slug)).rejects.toThrow(
      /Unsafe public Gallery/,
    );
  });
});
