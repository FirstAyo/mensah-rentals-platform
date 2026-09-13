import { HttpException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { describe, expect, it } from 'vitest';

import { CartEnquiryRateLimitGuard } from './cart-enquiry-rate-limit.guard';

function context(contactEmail: string, ip = '127.0.0.1') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body: { contactEmail }, ip }),
    }),
  } as unknown as ExecutionContext;
}

function guard(overrides: Partial<ApiEnvironment> = {}) {
  return new CartEnquiryRateLimitGuard(
    new ConfigService<ApiEnvironment, true>({
      PUBLIC_CONTACT_GLOBAL_RATE_LIMIT: 100,
      PUBLIC_CONTACT_GLOBAL_RATE_WINDOW_SECONDS: 60,
      PUBLIC_CONTACT_RATE_LIMIT: 2,
      PUBLIC_CONTACT_RATE_WINDOW_SECONDS: 3600,
      ...overrides,
    }),
  );
}

describe('cart enquiry rate limiting', () => {
  it('bounds a normalized IP/email identity while isolating other customers', () => {
    const limiter = guard();
    expect(limiter.canActivate(context('Customer@Example.test'))).toBe(true);
    expect(limiter.canActivate(context(' customer@example.test '))).toBe(true);
    expect(() => limiter.canActivate(context('customer@example.test'))).toThrow(
      /Too many rental enquiries/,
    );
    expect(limiter.canActivate(context('other@example.test'))).toBe(true);
  });

  it('enforces a global ceiling against rotating identities', () => {
    const limiter = guard({ PUBLIC_CONTACT_GLOBAL_RATE_LIMIT: 2 });
    expect(limiter.canActivate(context('first@example.test'))).toBe(true);
    expect(limiter.canActivate(context('second@example.test'))).toBe(true);
    expect(() => limiter.canActivate(context('third@example.test'))).toThrow(
      HttpException,
    );
  });

  it('returns a generic non-sensitive 429 response', () => {
    const limiter = guard({ PUBLIC_CONTACT_RATE_LIMIT: 1 });
    limiter.canActivate(context('customer@example.test'));
    try {
      limiter.canActivate(context('customer@example.test'));
      throw new Error('Expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toEqual({
        message: 'Too many rental enquiries. Please try again later.',
      });
      expect(JSON.stringify(error)).not.toMatch(
        /customer@example|inventory|token|hash|counter/i,
      );
    }
  });
});
