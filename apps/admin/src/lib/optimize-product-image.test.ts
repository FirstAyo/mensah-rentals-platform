import { describe, expect, it } from 'vitest';

import { containedDimensions } from './optimize-product-image';

describe('containedDimensions', () => {
  it('preserves aspect ratio while reducing a large image', () => {
    expect(containedDimensions(6000, 4000)).toEqual({
      width: 2400,
      height: 1600,
    });
  });

  it('does not enlarge a small image', () => {
    expect(containedDimensions(1200, 800)).toEqual({
      width: 1200,
      height: 800,
    });
  });
});
