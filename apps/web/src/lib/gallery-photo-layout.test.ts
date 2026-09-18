import { describe, expect, it } from 'vitest';

import {
  GALLERY_MOBILE_AUTOPLAY_MINIMUM,
  distributeGalleryRows,
} from './gallery-photo-layout';

describe('Gallery photo layout', () => {
  it('distributes ordered photos deterministically without changing existing row order', () => {
    const first = distributeGalleryRows([1, 2, 3, 4, 5, 6], 3);
    const expanded = distributeGalleryRows([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);

    expect(first).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(expanded).toEqual([
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9],
    ]);
    first.forEach((row, index) =>
      expect(expanded[index]!.slice(0, row.length)).toEqual(row),
    );
  });

  it('documents nine photos as the minimum for three convincing moving rows', () => {
    expect(GALLERY_MOBILE_AUTOPLAY_MINIMUM).toBe(9);
  });
});
