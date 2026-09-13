import { createHash } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request } from 'express';

import { BoundedRateLimitStore } from '../common/bounded-rate-limit.store';

@Injectable()
export class CartEnquiryRateLimitGuard implements CanActivate {
  private readonly counters = new BoundedRateLimitStore();

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const body =
      request.body && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>)
        : {};
    const email = String(body.contactEmail ?? '')
      .trim()
      .toLowerCase();
    const identity = createHash('sha256')
      .update(`${request.ip}|${email}`)
      .digest('hex');
    const message = 'Too many rental enquiries. Please try again later.';
    this.counters.consume(
      'cart-enquiry:global',
      this.config.get('PUBLIC_CONTACT_GLOBAL_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_CONTACT_GLOBAL_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      message,
    );
    this.counters.consume(
      `cart-enquiry:${identity}`,
      this.config.get('PUBLIC_CONTACT_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_CONTACT_RATE_WINDOW_SECONDS', { infer: true }),
      message,
    );
    return true;
  }
}
