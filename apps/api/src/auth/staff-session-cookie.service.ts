import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request, Response } from 'express';

@Injectable()
export class StaffSessionCookieService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  get cookieName(): string {
    return this.config.get('STAFF_SESSION_COOKIE_NAME', { infer: true });
  }

  read(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[this.cookieName];
    return typeof value === 'string' ? value : undefined;
  }

  set(response: Response, rawToken: string, expiresAt: Date): void {
    response.cookie(this.cookieName, rawToken, {
      expires: expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.config.get('AUTH_COOKIE_SECURE', { infer: true }),
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.config.get('AUTH_COOKIE_SECURE', { infer: true }),
    });
  }
}
