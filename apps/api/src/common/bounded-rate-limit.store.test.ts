import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { BoundedRateLimitStore } from './bounded-rate-limit.store';

describe('bounded rate-limit store', () => {
  it('fails closed at its hard cardinality cap and admits new keys after expiry', () => {
    const store = new BoundedRateLimitStore();
    for (let index = 0; index < 20_000; index += 1) {
      store.consume(`key:${index}`, 1, 60, 'Safe limit response', 1_000);
    }

    expect(() =>
      store.consume('one-too-many', 1, 60, 'Safe limit response', 1_000),
    ).toThrow(HttpException);
    expect(() =>
      store.consume('after-expiry', 1, 60, 'Safe limit response', 61_001),
    ).not.toThrow();
  });
});
