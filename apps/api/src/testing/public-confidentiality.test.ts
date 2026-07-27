import { describe, expect, it } from 'vitest';

import {
  expectPublicDataSafe,
  FORBIDDEN_PUBLIC_KEYS,
} from './public-confidentiality.test-utils';

describe('recursive public confidentiality assertion', () => {
  it('rejects every forbidden key at a nested depth', () => {
    for (const key of FORBIDDEN_PUBLIC_KEYS)
      expect(() =>
        expectPublicDataSafe({ safe: [{ nested: { [key]: 'private' } }] }),
      ).toThrow();
  });

  it('accepts customer intent fields and managed media URLs', () => {
    expect(() =>
      expectPublicDataSafe({
        desiredQuantity: 100,
        image: { url: '/media/products/a.webp' },
        requestedQuantity: 100,
      }),
    ).not.toThrow();
  });
});
