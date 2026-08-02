import { type CanActivate, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';

import { BoundedRateLimitStore } from '../common/bounded-rate-limit.store';

@Injectable()
export class PublicGoogleReviewsRateLimitGuard implements CanActivate {
  private readonly counters = new BoundedRateLimitStore();

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(): boolean {
    this.counters.consume(
      'public-google-reviews:global',
      this.config.get('PUBLIC_GOOGLE_REVIEWS_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_GOOGLE_REVIEWS_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      'Google reviews are temporarily busy. Please try again later.',
    );
    return true;
  }
}
