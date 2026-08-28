import { createHash } from 'node:crypto';

import { type CanActivate, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request } from 'express';

import { BoundedRateLimitStore } from '../common/bounded-rate-limit.store';

@Injectable()
export class ContactEnquiryRateLimitGuard implements CanActivate {
  private readonly counters = new BoundedRateLimitStore();

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const email =
      typeof request.body === 'object' && request.body !== null
        ? String((request.body as Record<string, unknown>).email ?? '')
            .trim()
            .toLowerCase()
        : '';
    const identity = createHash('sha256')
      .update(`${request.ip}|${email}`)
      .digest('hex');
    this.counters.consume(
      'contact:global',
      this.config.get('PUBLIC_CONTACT_GLOBAL_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_CONTACT_GLOBAL_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      'Contact enquiries are temporarily busy. Please try again later.',
    );
    this.counters.consume(
      `contact:${identity}`,
      this.config.get('PUBLIC_CONTACT_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_CONTACT_RATE_WINDOW_SECONDS', { infer: true }),
      'Too many contact enquiries. Please try again later.',
    );
    return true;
  }
}
