import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import type { StaffUserResponse } from '@mensah-rentals/types';
import {
  cuidParamSchema,
  replaceRolePermissionsSchema,
  replaceUserRolesSchema,
  type ReplaceRolePermissionsInput,
  type ReplaceUserRolesInput,
} from '@mensah-rentals/validation';

import { CurrentStaffUser } from '../auth/current-staff-user.decorator';
import { ZodBodyPipe } from '../auth/zod-body.pipe';
import { AuthorizationService } from './authorization.service';
import { RequirePermissions } from './require-permissions.decorator';

@Controller('admin')
export class AuthorizationController {
  constructor(
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  @Get('roles')
  @RequirePermissions('role.view')
  listRoles() {
    return this.authorization.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('role.view')
  listPermissions() {
    return this.authorization.listPermissions();
  }

  @Get('roles/:roleId')
  @RequirePermissions('role.view')
  getRole(@Param('roleId', new ZodBodyPipe(cuidParamSchema)) roleId: string) {
    return this.authorization.getRole(roleId);
  }

  @Put('roles/:roleId/permissions')
  @RequirePermissions('role.manage_permissions')
  replaceRolePermissions(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('roleId', new ZodBodyPipe(cuidParamSchema)) roleId: string,
    @Body(new ZodBodyPipe(replaceRolePermissionsSchema))
    input: ReplaceRolePermissionsInput,
  ) {
    return this.authorization.replaceRolePermissions(
      actor.id,
      roleId,
      input.permissionIds,
    );
  }

  @Put('users/:userId/roles')
  @RequirePermissions('user.role.manage')
  replaceUserRoles(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('userId', new ZodBodyPipe(cuidParamSchema)) userId: string,
    @Body(new ZodBodyPipe(replaceUserRolesSchema)) input: ReplaceUserRolesInput,
  ) {
    return this.authorization.replaceUserRoles(actor.id, userId, input.roleIds);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermissions('user.role.manage')
  removeUserRole(
    @CurrentStaffUser() actor: StaffUserResponse,
    @Param('userId', new ZodBodyPipe(cuidParamSchema)) userId: string,
    @Param('roleId', new ZodBodyPipe(cuidParamSchema)) roleId: string,
  ) {
    return this.authorization.removeUserRole(actor.id, userId, roleId);
  }
}
