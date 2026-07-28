import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

@Injectable()
export class AdminRentalRequestNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, noarchive');
    return next.handle();
  }
}
