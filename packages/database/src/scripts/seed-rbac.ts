import { prisma } from '../index';
import { runRbacSeed } from '../rbac-seed';

runRbacSeed(prisma)
  .then((result) => {
    const bootstrap = result.bootstrapRoleAssigned
      ? ' Bootstrap user promoted from zero roles.'
      : '';
    process.stdout.write(
      `RBAC seed complete: ${result.roles} system roles and ${result.permissions} permissions.${bootstrap}\n`,
    );
  })
  .catch(() => {
    process.stderr.write(
      'Unable to seed RBAC. Check the migration, reserved roles, and database connection.\n',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
