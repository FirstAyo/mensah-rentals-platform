import { HttpException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { describe, expect, it } from 'vitest';

import { PublicCartRateLimitGuard } from './public-cart-rate-limit.guard';

function context(method: 'DELETE' | 'GET' | 'PUT', token = '') {
  const request = {
    headers: token ? { 'x-rental-cart-token': token } : {},
    method,
    socket: { remoteAddress: '127.0.0.1' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(overrides: Partial<ApiEnvironment> = {}) {
  return new PublicCartRateLimitGuard(
    new ConfigService<ApiEnvironment, true>({
      PUBLIC_CART_GLOBAL_RATE_LIMIT: 100,
      PUBLIC_CART_GLOBAL_RATE_WINDOW_SECONDS: 60,
      PUBLIC_CART_MUTATION_RATE_LIMIT: 2,
      PUBLIC_CART_MUTATION_RATE_WINDOW_SECONDS: 60,
      PUBLIC_CART_READ_RATE_LIMIT: 3,
      PUBLIC_CART_READ_RATE_WINDOW_SECONDS: 60,
      ...overrides,
    }),
  );
}

describe('public cart rate limiting', () => {
  it('allows normal reads and mutations, then limits repeated capability mutations', () => {
    const limiter = guard();
    const token = 'a'.repeat(43);
    expect(limiter.canActivate(context('GET', token))).toBe(true);
    expect(limiter.canActivate(context('PUT', token))).toBe(true);
    expect(limiter.canActivate(context('DELETE', token))).toBe(true);
    expect(() => limiter.canActivate(context('PUT', token))).toThrow(
      /Too many rental cart attempts/,
    );
  });

  it('isolates valid capabilities behind the same BFF address', () => {
    const limiter = guard({ PUBLIC_CART_MUTATION_RATE_LIMIT: 1 });
    expect(limiter.canActivate(context('PUT', 'a'.repeat(43)))).toBe(true);
    expect(() => limiter.canActivate(context('PUT', 'a'.repeat(43)))).toThrow(
      /Too many rental cart attempts/,
    );
    expect(limiter.canActivate(context('PUT', 'b'.repeat(43)))).toBe(true);
  });

  it('uses one high global ceiling for missing and malformed token rotation', () => {
    const limiter = guard({ PUBLIC_CART_GLOBAL_RATE_LIMIT: 2 });
    expect(limiter.canActivate(context('PUT'))).toBe(true);
    expect(limiter.canActivate(context('PUT', 'malformed-one'))).toBe(true);
    expect(() => limiter.canActivate(context('PUT', 'malformed-two'))).toThrow(
      /Too many rental cart attempts/,
    );
  });

  it('returns a non-sensitive 429 response', () => {
    const limiter = guard({ PUBLIC_CART_MUTATION_RATE_LIMIT: 1 });
    const token = 'z'.repeat(43);
    limiter.canActivate(context('PUT', token));
    try {
      limiter.canActivate(context('PUT', token));
      throw new Error('Expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toEqual({
        message: 'Too many rental cart attempts. Please try again later.',
      });
      expect(JSON.stringify(error)).not.toMatch(
        /inventory|available|product|counter|hash|zzzz/i,
      );
    }
  });
});
