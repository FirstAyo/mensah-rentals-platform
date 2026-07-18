import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';

const editorRole = {
  id: 'role-editor',
  name: 'EDITOR',
  displayName: 'Editor',
  permissions: [{ permission: { key: 'product.view' } }],
};
const superRole = {
  id: 'role-super',
  name: 'SUPER_ADMIN',
  displayName: 'Super Admin',
  permissions: [
    { permission: { key: 'user.role.manage' } },
    { permission: { key: 'role.super_admin.manage' } },
    { permission: { key: 'product.view' } },
  ],
};

function createRoleAssignmentHarness(activeSuperAdmins = 2) {
  const targetRoleIds = new Set<string>();
  const actorKeys = new Set([
    'user.role.manage',
    'role.super_admin.manage',
    'product.view',
  ]);
  const roles = [editorRole, superRole];
  const target = () => ({
    id: 'target-user',
    status: 'ACTIVE',
    roles: roles
      .filter(({ id }) => targetRoleIds.has(id))
      .map((role) => ({ role })),
  });
  const transaction = {
    $executeRaw: vi.fn(),
    role: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        roles.filter(({ id }) => where.id.in.includes(id)),
      ),
      findUnique: vi.fn(),
    },
    user: {
      count: vi.fn(async () => activeSuperAdmins),
      findFirst: vi.fn(async () => ({
        roles: [
          {
            role: {
              permissions: [...actorKeys].map((key) => ({
                permission: { key },
              })),
            },
          },
        ],
      })),
      findUnique: vi.fn(async () => target()),
    },
    userRole: {
      createMany: vi.fn(
        async ({ data }: { data: Array<{ roleId: string }> }) => {
          data.forEach(({ roleId }) => targetRoleIds.add(roleId));
          return { count: data.length };
        },
      ),
      delete: vi.fn(
        async ({ where }: { where: { userId_roleId: { roleId: string } } }) => {
          targetRoleIds.delete(where.userId_roleId.roleId);
        },
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { roleId: { notIn: string[] } } }) => {
          [...targetRoleIds]
            .filter((id) => !where.roleId.notIn.includes(id))
            .forEach((id) => targetRoleIds.delete(id));
          return { count: 1 };
        },
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { userId_roleId: { roleId: string } } }) => {
          const role = roles.find(
            ({ id }) => id === where.userId_roleId.roleId,
          );
          return role && targetRoleIds.has(role.id)
            ? { role, user: target() }
            : null;
        },
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    user: {
      findUnique: vi.fn(async () => target()),
    },
  };
  const service = new AuthorizationService({
    prisma,
  } as unknown as AuthorizationRepository);
  return { actorKeys, service, targetRoleIds, transaction };
}

function createPermissionHarness(roleName = 'ADMIN') {
  const assignedPermissionIds = new Set<string>();
  const actorKeys = new Set(['role.manage_permissions', 'product.view']);
  const permission = {
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    description: 'View products.',
    id: 'permission-product-view',
    key: 'product.view',
  };
  const role = {
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    description: null,
    displayName: roleName === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin',
    id: 'target-role',
    isSystem: true,
    name: roleName,
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  };
  const transaction = {
    $executeRaw: vi.fn(),
    permission: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes(permission.id) ? [permission] : [],
      ),
    },
    role: { findUnique: vi.fn(async () => role) },
    rolePermission: {
      createMany: vi.fn(
        async ({ data }: { data: Array<{ permissionId: string }> }) => {
          data.forEach(({ permissionId }) =>
            assignedPermissionIds.add(permissionId),
          );
          return { count: data.length };
        },
      ),
      deleteMany: vi.fn(async () => {
        assignedPermissionIds.clear();
        return { count: 1 };
      }),
    },
    user: {
      findFirst: vi.fn(async () => ({
        roles: [
          {
            role: {
              permissions: [...actorKeys].map((key) => ({
                permission: { key },
              })),
            },
          },
        ],
      })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    role: {
      findUnique: vi.fn(async () => ({
        ...role,
        permissions: assignedPermissionIds.has(permission.id)
          ? [{ permission }]
          : [],
      })),
    },
  };
  return {
    actorKeys,
    service: new AuthorizationService({
      prisma,
    } as unknown as AuthorizationRepository),
    transaction,
  };
}

describe('AuthorizationService role assignments', () => {
  it('assigns and removes a role without duplicate effective assignments', async () => {
    const harness = createRoleAssignmentHarness();
    const assigned = await harness.service.replaceUserRoles(
      'actor',
      'target-user',
      [editorRole.id],
    );
    expect(assigned.roles.map(({ name }) => name)).toEqual(['EDITOR']);
    const removed = await harness.service.removeUserRole(
      'actor',
      'target-user',
      editorRole.id,
    );
    expect(removed.roles).toEqual([]);
  });

  it('reflects permission revocation at the next mutation authorization check', async () => {
    const harness = createRoleAssignmentHarness();
    harness.actorKeys.delete('user.role.manage');
    await expect(
      harness.service.replaceUserRoles('actor', 'target-user', [editorRole.id]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents removal of the last active SUPER_ADMIN', async () => {
    const harness = createRoleAssignmentHarness(1);
    harness.targetRoleIds.add(superRole.id);
    await expect(
      harness.service.removeUserRole('actor', 'target-user', superRole.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the owner permission to change SUPER_ADMIN assignment', async () => {
    const harness = createRoleAssignmentHarness();
    harness.actorKeys.delete('role.super_admin.manage');
    await expect(
      harness.service.replaceUserRoles('actor', 'target-user', [superRole.id]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not assign a role containing a permission the actor lacks', async () => {
    const harness = createRoleAssignmentHarness();
    harness.actorKeys.delete('product.view');
    await expect(
      harness.service.replaceUserRoles('actor', 'target-user', [editorRole.id]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a disabled actor during transactional reauthorization', async () => {
    const harness = createRoleAssignmentHarness();
    harness.transaction.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      harness.service.replaceUserRoles('actor', 'target-user', [editorRole.id]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthorizationService role permissions', () => {
  it('replaces role permissions and returns the new safe detail', async () => {
    const harness = createPermissionHarness();
    const result = await harness.service.replaceRolePermissions(
      'actor',
      'target-role',
      ['permission-product-view'],
    );
    expect(result.permissions.map(({ key }) => key)).toEqual(['product.view']);
  });

  it('does not grant a permission the actor lacks', async () => {
    const harness = createPermissionHarness();
    harness.actorKeys.delete('product.view');
    await expect(
      harness.service.replaceRolePermissions('actor', 'target-role', [
        'permission-product-view',
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the SUPER_ADMIN permission mapping immutable', async () => {
    const harness = createPermissionHarness('SUPER_ADMIN');
    await expect(
      harness.service.replaceRolePermissions('actor', 'target-role', []),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unknown permission IDs without writing', async () => {
    const harness = createPermissionHarness();
    await expect(
      harness.service.replaceRolePermissions('actor', 'target-role', [
        'permission-missing',
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      harness.transaction.rolePermission.deleteMany,
    ).not.toHaveBeenCalled();
  });
});
