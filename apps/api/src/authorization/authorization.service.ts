import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus, type Prisma } from '@mensah-rentals/database';
import {
  SUPER_ADMIN_MANAGE_PERMISSION,
  SUPER_ADMIN_ROLE_NAME,
} from '@mensah-rentals/rbac';
import type {
  PermissionResponse,
  RoleDetailResponse,
  RoleResponse,
  StaffRoleSummary,
} from '@mensah-rentals/types';

import { AuthorizationRepository } from './authorization.repository';

const RBAC_MUTATION_LOCK_ID = 2_026_071_804;

function mapPermission(permission: {
  createdAt: Date;
  description: string;
  id: string;
  key: string;
}): PermissionResponse {
  return { ...permission, createdAt: permission.createdAt.toISOString() };
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly repository: AuthorizationRepository) {}

  async listRoles(): Promise<RoleResponse[]> {
    const roles = await this.repository.prisma.role.findMany({
      include: { _count: { select: { permissions: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => ({
      createdAt: role.createdAt.toISOString(),
      description: role.description,
      displayName: role.displayName,
      id: role.id,
      isSystem: role.isSystem,
      name: role.name,
      permissionCount: role._count.permissions,
      updatedAt: role.updatedAt.toISOString(),
    }));
  }

  async listPermissions(): Promise<PermissionResponse[]> {
    return (
      await this.repository.prisma.permission.findMany({
        orderBy: { key: 'asc' },
      })
    ).map(mapPermission);
  }

  async getRole(roleId: string): Promise<RoleDetailResponse> {
    const role = await this.repository.prisma.role.findUnique({
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { key: 'asc' } },
        },
      },
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException('Role not found');
    return {
      createdAt: role.createdAt.toISOString(),
      description: role.description,
      displayName: role.displayName,
      id: role.id,
      isSystem: role.isSystem,
      name: role.name,
      permissionCount: role.permissions.length,
      permissions: role.permissions.map(({ permission }) =>
        mapPermission(permission),
      ),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  async replaceRolePermissions(
    actorId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<RoleDetailResponse> {
    await this.repository.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${RBAC_MUTATION_LOCK_ID})`;
      const actorKeys = await this.requireActorPermissions(
        transaction,
        actorId,
        ['role.manage_permissions'],
      );
      const role = await transaction.role.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.name === SUPER_ADMIN_ROLE_NAME)
        throw new ConflictException('SUPER_ADMIN permissions are protected');
      const permissions = await transaction.permission.findMany({
        where: { id: { in: permissionIds } },
      });
      if (permissions.length !== permissionIds.length)
        throw new NotFoundException('One or more permissions were not found');
      const requestedKeys = permissions.map(({ key }) => key);
      if (requestedKeys.includes(SUPER_ADMIN_MANAGE_PERMISSION))
        throw new ForbiddenException('Owner-level permission is protected');
      if (requestedKeys.some((key) => !actorKeys.has(key)))
        throw new ForbiddenException(
          'Cannot grant permissions you do not hold',
        );
      await transaction.rolePermission.deleteMany({ where: { roleId } });
      await transaction.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ permissionId, roleId })),
      });
    });
    return this.getRole(roleId);
  }

  async replaceUserRoles(
    actorId: string,
    userId: string,
    roleIds: string[],
  ): Promise<{ roles: StaffRoleSummary[]; userId: string }> {
    await this.repository.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${RBAC_MUTATION_LOCK_ID})`;
      const actorKeys = await this.requireActorPermissions(
        transaction,
        actorId,
        ['user.role.manage'],
      );
      const target = await transaction.user.findUnique({
        include: { roles: { include: { role: true } } },
        where: { id: userId },
      });
      if (!target) throw new NotFoundException('Staff user not found');
      const roles = await transaction.role.findMany({
        include: { permissions: { include: { permission: true } } },
        where: { id: { in: roleIds } },
      });
      if (roles.length !== roleIds.length)
        throw new NotFoundException('One or more roles were not found');
      const changesSuper =
        target.roles.some(({ role }) => role.name === SUPER_ADMIN_ROLE_NAME) !==
        roles.some(({ name }) => name === SUPER_ADMIN_ROLE_NAME);
      if (changesSuper && !actorKeys.has(SUPER_ADMIN_MANAGE_PERMISSION))
        throw new ForbiddenException('SUPER_ADMIN assignment is protected');
      if (
        roles
          .flatMap(({ permissions }) => permissions)
          .some(({ permission }) => !actorKeys.has(permission.key))
      ) {
        throw new ForbiddenException(
          'Cannot assign a role containing permissions you do not hold',
        );
      }
      if (
        changesSuper &&
        target.roles.some(({ role }) => role.name === SUPER_ADMIN_ROLE_NAME) &&
        target.status === UserStatus.ACTIVE
      ) {
        await this.preventLastActiveSuperAdminRemoval(transaction);
      }
      await transaction.userRole.deleteMany({
        where: { userId, roleId: { notIn: roleIds } },
      });
      await transaction.userRole.createMany({
        data: roleIds.map((roleId) => ({
          assignedById: actorId,
          roleId,
          userId,
        })),
        skipDuplicates: true,
      });
    });
    return this.getUserRoles(userId);
  }

  async removeUserRole(
    actorId: string,
    userId: string,
    roleId: string,
  ): Promise<{ roles: StaffRoleSummary[]; userId: string }> {
    await this.repository.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${RBAC_MUTATION_LOCK_ID})`;
      const actorKeys = await this.requireActorPermissions(
        transaction,
        actorId,
        ['user.role.manage'],
      );
      const assignment = await transaction.userRole.findUnique({
        include: { role: true, user: true },
        where: { userId_roleId: { roleId, userId } },
      });
      if (!assignment) throw new NotFoundException('Role assignment not found');
      if (assignment.role.name === SUPER_ADMIN_ROLE_NAME) {
        if (!actorKeys.has(SUPER_ADMIN_MANAGE_PERMISSION))
          throw new ForbiddenException('SUPER_ADMIN assignment is protected');
        if (assignment.user.status === UserStatus.ACTIVE)
          await this.preventLastActiveSuperAdminRemoval(transaction);
      }
      await transaction.userRole.delete({
        where: { userId_roleId: { roleId, userId } },
      });
    });
    return this.getUserRoles(userId);
  }

  private async getUserRoles(
    userId: string,
  ): Promise<{ roles: StaffRoleSummary[]; userId: string }> {
    const user = await this.repository.prisma.user.findUnique({
      include: {
        roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } },
      },
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Staff user not found');
    return {
      roles: user.roles.map(({ role }) => ({
        displayName: role.displayName,
        id: role.id,
        name: role.name,
      })),
      userId,
    };
  }

  private async requireActorPermissions(
    transaction: Prisma.TransactionClient,
    actorId: string,
    required: string[],
  ): Promise<Set<string>> {
    const actor = await transaction.user.findFirst({
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
      where: { id: actorId, status: UserStatus.ACTIVE },
    });
    if (!actor) throw new ForbiddenException('Staff account is not active');
    const keys = new Set(
      actor.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ),
    );
    if (required.some((permission) => !keys.has(permission)))
      throw new ForbiddenException('Insufficient permissions');
    return keys;
  }

  private async preventLastActiveSuperAdminRemoval(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const activeSuperAdmins = await transaction.user.count({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: SUPER_ADMIN_ROLE_NAME } } },
      },
    });
    if (activeSuperAdmins <= 1)
      throw new ConflictException(
        'The last active SUPER_ADMIN cannot be removed',
      );
  }
}
