import {
  PERMISSION_CATALOGUE,
  SUPER_ADMIN_ROLE_NAME,
  SYSTEM_ROLES,
} from '@mensah-rentals/rbac';
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from './index';
import { runRbacSeed } from './rbac-seed';

describe('RBAC seed against PostgreSQL', () => {
  afterAll(async () => prisma.$disconnect());

  it('is idempotent and keeps exact unique system records', async () => {
    const first = await runRbacSeed(prisma);
    const second = await runRbacSeed(prisma);
    expect(second).toMatchObject({
      permissions: PERMISSION_CATALOGUE.length,
      roles: SYSTEM_ROLES.length,
    });
    expect(second.permissions).toBe(first.permissions);
    expect(second.roles).toBe(first.roles);
  });

  it('gives SUPER_ADMIN every seeded permission without duplicate joins', async () => {
    const role = await prisma.role.findUnique({
      include: { permissions: true },
      where: { name: SUPER_ADMIN_ROLE_NAME },
    });
    expect(role?.permissions).toHaveLength(PERMISSION_CATALOGUE.length);
    expect(
      new Set(role?.permissions.map(({ permissionId }) => permissionId)).size,
    ).toBe(PERMISSION_CATALOGUE.length);
  });

  it('adds only newly introduced defaults to existing roles', async () => {
    const admin = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const oldPermission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'product.view' },
    });
    const newPermission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'inventory.reservation.create' },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        OR: [
          { roleId: admin.id, permissionId: oldPermission.id },
          { permissionId: newPermission.id },
        ],
      },
    });
    await prisma.permission.delete({ where: { id: newPermission.id } });

    await runRbacSeed(prisma);

    const restoredNew = await prisma.permission.findUniqueOrThrow({
      where: { key: 'inventory.reservation.create' },
    });
    await expect(
      prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: admin.id,
            permissionId: restoredNew.id,
          },
        },
      }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: admin.id,
            permissionId: oldPermission.id,
          },
        },
      }),
    ).resolves.toBeNull();

    await prisma.rolePermission.create({
      data: { roleId: admin.id, permissionId: oldPermission.id },
    });
  });

  it('keeps the configured active bootstrap user as SUPER_ADMIN', async () => {
    const email = `test-bootstrap-${randomUUID()}@example.test`;
    await prisma.user.create({
      data: {
        email,
        firstName: 'Test',
        lastName: 'Bootstrap',
        passwordHash: 'not-used',
        status: 'ACTIVE',
      },
    });
    const seeded = await runRbacSeed(prisma, {
      NODE_ENV: 'development',
      STAFF_BOOTSTRAP_EMAIL: email,
    });
    expect(seeded.bootstrapRoleAssigned).toBe(true);
    const user = await prisma.user.findUnique({
      include: { roles: { include: { role: true } } },
      where: { email },
    });
    expect(
      user?.roles.some(({ role }) => role.name === SUPER_ADMIN_ROLE_NAME),
    ).toBe(true);
  });
});
