import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import { describe, expect, it } from 'vitest';

import { PublicRentalRequestRateLimitGuard } from './public-rental-request-rate-limit.guard';

function context(
  method: 'GET' | 'POST',
  token: string,
  remoteAddress = '127.0.0.1',
): ExecutionContext {
  const request = {
    headers: {
      [method === 'GET' ? 'x-rental-request-token' : 'x-rental-cart-token']:
        token,
    },
    ip: '127.0.0.1',
    method,
    socket: { remoteAddress },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('public rental request rate limiting', () => {
  it('limits capabilities without treating every client behind the BFF as one user', () => {
    const guard = new PublicRentalRequestRateLimitGuard(
      new ConfigService<ApiEnvironment, true>({
        PUBLIC_REQUEST_SUBMIT_RATE_LIMIT: 2,
        PUBLIC_REQUEST_SUBMIT_RATE_WINDOW_SECONDS: 60,
        PUBLIC_REQUEST_TRACK_RATE_LIMIT: 1,
        PUBLIC_REQUEST_TRACK_RATE_WINDOW_SECONDS: 60,
        PUBLIC_REQUEST_GLOBAL_RATE_LIMIT: 100,
        PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS: 60,
      }),
    );
    expect(guard.canActivate(context('POST', 'c'.repeat(43)))).toBe(true);
    expect(guard.canActivate(context('POST', 'c'.repeat(43)))).toBe(true);
    expect(() => guard.canActivate(context('POST', 'c'.repeat(43)))).toThrow(
      /Too many rental request attempts/,
    );
    expect(guard.canActivate(context('POST', 'd'.repeat(43)))).toBe(true);
    expect(guard.canActivate(context('POST', 'e'.repeat(43), '10.0.0.2'))).toBe(
      true,
    );
    expect(guard.canActivate(context('GET', 'd'.repeat(43)))).toBe(true);
  });

  it('uses a separate global ceiling for malformed capability rotation', () => {
    const malformedGuard = new PublicRentalRequestRateLimitGuard(
      new ConfigService<ApiEnvironment, true>({
        PUBLIC_REQUEST_SUBMIT_RATE_LIMIT: 5,
        PUBLIC_REQUEST_SUBMIT_RATE_WINDOW_SECONDS: 60,
        PUBLIC_REQUEST_TRACK_RATE_LIMIT: 60,
        PUBLIC_REQUEST_TRACK_RATE_WINDOW_SECONDS: 60,
        PUBLIC_REQUEST_GLOBAL_RATE_LIMIT: 1,
        PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS: 60,
      }),
    );
    expect(malformedGuard.canActivate(context('GET', 'malformed-one'))).toBe(
      true,
    );
    expect(() =>
      malformedGuard.canActivate(context('GET', 'malformed-two')),
    ).toThrow(/Too many rental request attempts/);
  });
});
