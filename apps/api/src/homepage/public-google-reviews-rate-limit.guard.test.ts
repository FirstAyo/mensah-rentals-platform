import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { describe, expect, it } from 'vitest';

import { PublicGoogleReviewsRateLimitGuard } from './public-google-reviews-rate-limit.guard';

describe('public Google Reviews rate limiting', () => {
  it('enforces the bounded global billable-request ceiling', () => {
    const config = {
      get: (name: keyof ApiEnvironment) =>
        name === 'PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT' ? 2 : 60,
    } as ConfigService<ApiEnvironment, true>;
    const guard = new PublicGoogleReviewsRateLimitGuard(config);
    expect(guard.canActivate()).toBe(true);
    expect(guard.canActivate()).toBe(true);
    expect(() => guard.canActivate()).toThrow(
      'Google reviews are temporarily busy',
    );
  });
});
