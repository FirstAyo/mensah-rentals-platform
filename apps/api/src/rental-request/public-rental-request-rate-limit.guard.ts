import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashSessionToken } from '@mensah-rentals/auth';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request } from 'express';

interface Counter {
  count: number;
  resetsAt: number;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_COUNTERS = 20_000;

@Injectable()
export class PublicRentalRequestRateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, Counter>();

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
    this.consume(
      'rental-request:global',
      this.config.get('PUBLIC_REQUEST_GLOBAL_RATE_LIMIT', { infer: true }),
      this.config.get('PUBLIC_REQUEST_GLOBAL_RATE_WINDOW_SECONDS', {
        infer: true,
      }),
      now,
    );
    const keys: string[] = [];
    if (TOKEN_PATTERN.test(rawCapability))
      keys.push(`${operation}:capability:${hashSessionToken(rawCapability)}`);
    for (const key of keys) this.consume(key, limit, windowSeconds, now);
    return true;
  }

  private consume(
    key: string,
    limit: number,
    windowSeconds: number,
    now: number,
  ): void {
    const current = this.counters.get(key);
    if (!current || current.resetsAt <= now) {
      if (!current && this.counters.size >= MAX_COUNTERS) {
        for (const [storedKey, counter] of this.counters)
          if (counter.resetsAt <= now) this.counters.delete(storedKey);
      }
      if (!current && this.counters.size >= MAX_COUNTERS)
        this.tooManyRequests();
      this.counters.set(key, {
        count: 1,
        resetsAt: now + windowSeconds * 1000,
      });
      return;
    }
    current.count += 1;
    if (current.count > limit) this.tooManyRequests();
  }

  private tooManyRequests(): never {
    throw new HttpException(
      { message: 'Too many rental request attempts. Please try again later.' },
      429,
    );
  }
}
