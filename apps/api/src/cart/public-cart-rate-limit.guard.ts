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
const MESSAGE = 'Too many rental cart attempts. Please try again later.';

@Injectable()
export class PublicCartRateLimitGuard implements CanActivate {
  private readonly counters = new BoundedRateLimitStore();

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const read = request.method === 'GET';
    const now = Date.now();
    this.counters.consume(
      'rental-cart:global',
      this.config.get('PUBLIC_CART_GLOBAL_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_CART_GLOBAL_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      MESSAGE,
      now,
    );

    const rawCapability = String(request.headers['x-rental-cart-token'] ?? '');
    if (TOKEN_PATTERN.test(rawCapability)) {
      this.counters.consume(
        `rental-cart:${read ? 'read' : 'mutate'}:${hashSessionToken(rawCapability)}`,
        this.config.get(
          read
            ? 'PUBLIC_CART_READ_RATE_LIMIT'
            : 'PUBLIC_CART_MUTATION_RATE_LIMIT',
          { infer: true },
        ),
        this.config.get(
          read
            ? 'PUBLIC_CART_READ_RATE_WINDOW_SECONDS'
            : 'PUBLIC_CART_MUTATION_RATE_WINDOW_SECONDS',
          { infer: true },
        ),
        MESSAGE,
        now,
      );
    }
    return true;
  }
}
