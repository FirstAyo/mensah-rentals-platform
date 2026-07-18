import {
  ALL_PERMISSION_KEYS,
  SUPER_ADMIN_ROLE_NAME,
  SYSTEM_ROLES,
} from '@mensah-rentals/rbac';
import { prisma } from '../index';
import { runRbacSeed } from '../rbac-seed';

async function verify(): Promise<void> {
  const before = await runRbacSeed(prisma);
  const after = await runRbacSeed(prisma);
  if (before.permissions !== after.permissions || before.roles !== after.roles)
    throw new Error('Seed is not idempotent.');
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    where: { name: { in: SYSTEM_ROLES.map(({ name }) => name) } },
  });
  if (roles.length !== SYSTEM_ROLES.length)
    throw new Error('System roles are missing.');
  const superAdmin = roles.find(({ name }) => name === SUPER_ADMIN_ROLE_NAME);
  const samplePermission = superAdmin?.permissions[0];
  if (!superAdmin || !samplePermission)
    throw new Error('SUPER_ADMIN mapping is missing.');
  if (superAdmin.permissions.length !== ALL_PERMISSION_KEYS.length)
    throw new Error('SUPER_ADMIN is incomplete.');
  const duplicateRolePermission = await prisma.$queryRaw<
    Array<{ roleId: string }>
  >`
    INSERT INTO "RolePermission" ("roleId", "permissionId")
    VALUES (${superAdmin.id}, ${samplePermission.permissionId})
    ON CONFLICT DO NOTHING
    RETURNING "roleId"
  `;
  if (duplicateRolePermission.length !== 0)
    throw new Error('Duplicate role permissions are not prevented.');

  const bootstrapEmail =
    process.env.STAFF_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  let bootstrapVerified = false;
  if (process.env.NODE_ENV === 'development' && bootstrapEmail) {
    const bootstrap = await prisma.user.findUnique({
      include: { roles: { include: { role: true } } },
      where: { email: bootstrapEmail },
    });
    if (
      !bootstrap?.roles.some(({ role }) => role.name === SUPER_ADMIN_ROLE_NAME)
    ) {
      throw new Error('The development bootstrap user is not SUPER_ADMIN.');
    }
    const duplicateUserRole = await prisma.$queryRaw<Array<{ userId: string }>>`
      INSERT INTO "UserRole" ("userId", "roleId")
      VALUES (${bootstrap.id}, ${superAdmin.id})
      ON CONFLICT DO NOTHING
      RETURNING "userId"
    `;
    if (duplicateUserRole.length !== 0)
      throw new Error('Duplicate user roles are not prevented.');
    bootstrapVerified = true;
  }
  process.stdout.write(
    `RBAC verification passed: ${after.roles} system roles, ${after.permissions} permissions, idempotent seed, and unique assignments${bootstrapVerified ? ', plus local bootstrap SUPER_ADMIN' : ''}.\n`,
  );
}

verify()
  .catch(() => {
    process.stderr.write(
      'RBAC verification failed. Review the seeded database state.\n',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
