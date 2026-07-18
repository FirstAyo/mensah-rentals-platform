import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@mensah-rentals/rbac';

export const REQUIRED_PERMISSIONS = Symbol('required-permissions');

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
