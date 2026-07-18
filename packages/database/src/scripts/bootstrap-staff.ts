import { hashPassword, normalizeEmail } from '@mensah-rentals/auth';
import { staffBootstrapEnvironmentSchema } from '@mensah-rentals/validation';
import { SUPER_ADMIN_ROLE_NAME } from '@mensah-rentals/rbac';
import { UserStatus } from '@prisma/client';

import { prisma } from '../index';

async function bootstrapStaffUser(): Promise<void> {
  const environment = staffBootstrapEnvironmentSchema.parse(process.env);
  const email = normalizeEmail(environment.STAFF_BOOTSTRAP_EMAIL);
  const passwordHash = await hashPassword(environment.STAFF_BOOTSTRAP_PASSWORD);
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${2_026_071_803})`;
    const role = await transaction.role.findUnique({
      where: { name: SUPER_ADMIN_ROLE_NAME },
    });
    if (!role) throw new Error('Run the RBAC seed before staff bootstrap.');
    const existing = await transaction.user.findUnique({
      include: { roles: true },
      where: { email },
    });
    if (existing) {
      if (
        existing.status === UserStatus.ACTIVE &&
        existing.roles.length === 0
      ) {
        await transaction.userRole.create({
          data: { roleId: role.id, userId: existing.id },
        });
        return 'assigned SUPER_ADMIN to' as const;
      }
      return 'left unchanged' as const;
    }
    await transaction.user.create({
      data: {
        email,
        firstName: environment.STAFF_BOOTSTRAP_FIRST_NAME,
        lastName: environment.STAFF_BOOTSTRAP_LAST_NAME,
        passwordHash,
        roles: { create: { roleId: role.id } },
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    return 'created' as const;
  });
  process.stdout.write(`Development staff user ${result} (${email}).\n`);
}

bootstrapStaffUser()
  .catch(() => {
    process.stderr.write(
      'Unable to create the development staff user. Check the documented environment values and database connection.\n',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
