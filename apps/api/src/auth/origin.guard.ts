import {
  ForbiddenException,
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ApiEnvironment } from '@mensah-rentals/validation';
import type { Request } from 'express';

import { IS_PUBLIC_ROUTE } from './public.decorator';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOW_MULTIPART = Symbol('allow-multipart');
export const AllowMultipart = () => SetMetadata(ALLOW_MULTIPART, true);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(Reflector)
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!UNSAFE_METHODS.has(request.method)) {
      return true;
    }

    const isAuthenticationRequest = request.path.startsWith('/auth/');
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    const requiresAdminOrigin = isAuthenticationRequest || !isPublic;

    if (requiresAdminOrigin) {
      const allowedOrigin = this.config.get('ADMIN_ORIGIN', { infer: true });
      if (request.headers.origin !== allowedOrigin) {
        throw new ForbiddenException('Request origin is not allowed');
      }
    }

    if (requiresAdminOrigin) {
      const contentType = request.headers['content-type'] ?? '';
      const multipartAllowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_MULTIPART,
        [context.getHandler(), context.getClass()],
      );
      const valid =
        contentType.startsWith('application/json') ||
        (multipartAllowed && contentType.startsWith('multipart/form-data;'));
      if (!valid)
        throw new UnsupportedMediaTypeException(
          multipartAllowed
            ? 'JSON or multipart image data is required'
            : 'JSON requests are required',
        );
    }

    return true;
  }
}
