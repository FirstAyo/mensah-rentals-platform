import { hashPassword, normalizeEmail } from '@mensah-rentals/auth';
import { staffBootstrapEnvironmentSchema } from '@mensah-rentals/validation';
import { UserStatus } from '@prisma/client';

import { prisma } from '../index';

async function bootstrapStaffUser(): Promise<void> {
  const environment = staffBootstrapEnvironmentSchema.parse(process.env);
  const email = normalizeEmail(environment.STAFF_BOOTSTRAP_EMAIL);
  const existingUser = await prisma.user.findUnique({
    select: { id: true },
    where: { email },
  });

  if (existingUser) {
    process.stdout.write(
      `Development staff user already exists (${email}); account left unchanged.\n`,
    );
    return;
  }

  const passwordHash = await hashPassword(environment.STAFF_BOOTSTRAP_PASSWORD);

  await prisma.user.create({
    data: {
      email,
      firstName: environment.STAFF_BOOTSTRAP_FIRST_NAME,
      lastName: environment.STAFF_BOOTSTRAP_LAST_NAME,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });

  process.stdout.write(`Development staff user created (${email}).\n`);
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
