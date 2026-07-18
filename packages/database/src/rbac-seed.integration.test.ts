import { SUPER_ADMIN_ROLE_NAME, SYSTEM_ROLES } from '@mensah-rentals/rbac';
import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from './index';
import { runRbacSeed } from './rbac-seed';

describe('RBAC seed against PostgreSQL', () => {
  afterAll(async () => prisma.$disconnect());

  it('is idempotent and keeps exact unique system records', async () => {
    const first = await runRbacSeed(prisma);
    const second = await runRbacSeed(prisma);
    expect(second).toMatchObject({
      permissions: 45,
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
    expect(role?.permissions).toHaveLength(45);
    expect(
      new Set(role?.permissions.map(({ permissionId }) => permissionId)).size,
    ).toBe(45);
  });

  it('keeps the configured active bootstrap user as SUPER_ADMIN', async () => {
    const email = process.env.STAFF_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    expect(email).toBeTruthy();
    const user = await prisma.user.findUnique({
      include: { roles: { include: { role: true } } },
      where: { email },
    });
    expect(
      user?.roles.some(({ role }) => role.name === SUPER_ADMIN_ROLE_NAME),
    ).toBe(true);
  });
});
