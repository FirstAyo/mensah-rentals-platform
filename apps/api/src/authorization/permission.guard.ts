import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@mensah-rentals/rbac';

import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { IS_PUBLIC_ROUTE } from '../auth/public.decorator';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const required =
      this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedStaffRequest>().staffUser;
    if (!user) throw new UnauthorizedException('Authentication required');
    const effective = new Set(user.permissionKeys);
    if (!required.every((permission) => effective.has(permission))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
