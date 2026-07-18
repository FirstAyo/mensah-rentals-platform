import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { StaffSessionCookieService } from './staff-session-cookie.service';

describe('StaffSessionCookieService', () => {
  it('sets and clears a production __Host- cookie with matching secure attributes', () => {
    const service = new StaffSessionCookieService(
      new ConfigService<ApiEnvironment, true>({
        AUTH_COOKIE_SECURE: true,
        STAFF_SESSION_COOKIE_NAME: '__Host-mensah_staff_session',
      }),
    );
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const response = { clearCookie, cookie } as unknown as Response;
    const expiresAt = new Date('2026-07-18T20:00:00.000Z');

    service.set(response, 'opaque-token', expiresAt);
    service.clear(response);

    const commonOptions = {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    };
    expect(cookie).toHaveBeenCalledWith(
      '__Host-mensah_staff_session',
      'opaque-token',
      { ...commonOptions, expires: expiresAt },
    );
    expect(clearCookie).toHaveBeenCalledWith(
      '__Host-mensah_staff_session',
      commonOptions,
    );
  });
});
