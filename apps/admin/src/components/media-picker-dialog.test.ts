import { describe, expect, it } from 'vitest';

import { mediaPreviewUrl, type MediaLibraryItem } from './media-picker-dialog';

const hash = 'a'.repeat(64);

function media(overrides: Partial<MediaLibraryItem>): MediaLibraryItem {
  return {
    id: 'cm00000000000000000000000',
    mediaRef: 'cm00000000000000000000000',
    source: 'HOMEPAGE',
    url: `/media/homepage/cm00000000000000000000000/${hash}.webp`,
    label: 'event.webp',
    description: 'Event equipment',
    width: 1600,
    height: 1000,
    byteSize: 1000,
    usageCount: 1,
    productName: null,
    ...overrides,
  };
}

describe('managed-media preview URLs', () => {
  it('uses the authenticated BFF URL for normalized WebP media', () => {
    expect(mediaPreviewUrl(media({}))).toBe(
      `/api/homepage/media/cm00000000000000000000000/${hash}.webp`,
    );
  });

  it('preserves safe product-media URLs', () => {
    expect(
      mediaPreviewUrl(
        media({ source: 'PRODUCT', url: '/media/products/image.webp' }),
      ),
    ).toBe('/media/products/image.webp');
  });

  it('fails closed for malformed managed-media names', () => {
    expect(mediaPreviewUrl(media({ url: '/media/homepage/file.jpg' }))).toBe(
      '',
    );
  });
});
