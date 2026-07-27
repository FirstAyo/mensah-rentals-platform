import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request } from 'express';

import { BoundedRateLimitStore } from '../common/bounded-rate-limit.store';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MESSAGE = 'Too many rental request attempts. Please try again later.';

@Injectable()
export class PublicRentalRequestRateLimitGuard implements CanActivate {
  private readonly counters = new BoundedRateLimitStore();

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const tracking = request.method === 'GET';
    const limit = this.config.get(
      tracking
        ? 'PUBLIC_REQUEST_TRACK_RATE_LIMIT'
        : 'PUBLIC_REQUEST_SUBMIT_RATE_LIMIT',
      { infer: true },
    );
    const windowSeconds = this.config.get(
      tracking
        ? 'PUBLIC_REQUEST_TRACK_RATE_WINDOW_SECONDS'
        : 'PUBLIC_REQUEST_SUBMIT_RATE_WINDOW_SECONDS',
      { infer: true },
    );
    const rawCapability = String(
      request.headers[
        tracking ? 'x-rental-request-token' : 'x-rental-cart-token'
      ] ?? '',
    );
    const now = Date.now();
    const operation = tracking ? 'track' : 'submit';
    this.counters.consume(
      'rental-request:global',
      this.config.get('PUBLIC_REQUEST_GLOBAL_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      MESSAGE,
      now,
    );
    const keys: string[] = [];
    if (TOKEN_PATTERN.test(rawCapability))
      keys.push(`${operation}:capability:${hashSessionToken(rawCapability)}`);
    for (const key of keys)
      this.counters.consume(key, limit, windowSeconds, MESSAGE, now);
    return true;
  }
}
