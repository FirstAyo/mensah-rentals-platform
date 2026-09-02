import { hashPassword, normalizeEmail } from '@mensah-rentals/auth';
import { SUPER_ADMIN_ROLE_NAME } from '@mensah-rentals/rbac';
import { staffOperatorBootstrapEnvironmentSchema } from '@mensah-rentals/validation';
import { UserStatus } from '@prisma/client';

import { prisma } from '../index';

async function bootstrapFirstOperator(): Promise<void> {
  const environment = staffOperatorBootstrapEnvironmentSchema.parse(
    process.env,
  );
  const email = normalizeEmail(environment.STAFF_BOOTSTRAP_EMAIL);
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${2_026_090_201})`;
    const role = await transaction.role.findUnique({
      where: { name: SUPER_ADMIN_ROLE_NAME },
    });
    if (!role) throw new Error('Run the RBAC seed before operator bootstrap.');

    const existing = await transaction.user.findUnique({
      include: { roles: true },
      where: { email },
    });
    if (
      existing?.status === UserStatus.ACTIVE &&
      existing.roles.some((assignment) => assignment.roleId === role.id)
    ) {
      return 'already exists' as const;
    }

    const userCount = await transaction.user.count();
    if (userCount !== 0) {
      throw new Error(
        'Operator bootstrap is allowed only for an empty user table or an existing active SUPER_ADMIN with the same email.',
      );
    }

    const passwordHash = await hashPassword(
      environment.STAFF_BOOTSTRAP_PASSWORD,
    );
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

  process.stdout.write(
    `${environment.PLATFORM_ENVIRONMENT} first SUPER_ADMIN ${result} (${email}).\n`,
  );
}

bootstrapFirstOperator()
  .catch((error) => {
    const message =
      error instanceof Error &&
      error.message.startsWith('Operator bootstrap is allowed')
        ? error.message
        : 'Unable to bootstrap the first operator. Check the confirmed environment, RBAC seed, credentials, and database connection.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
