import {
  Injectable,
  Inject,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from './auth.service';
import type { AuthenticatedStaffRequest } from './auth.types';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { StaffSessionCookieService } from './staff-session-cookie.service';

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(StaffSessionCookieService)
    private readonly cookieService: StaffSessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedStaffRequest>();
    const session = await this.authService.validateSession(
      this.cookieService.read(request),
    );

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    request.staffSessionId = session.sessionId;
    request.staffUser = session.user;
    return true;
  }
}
