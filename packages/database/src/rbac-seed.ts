import {
  DEFAULT_ROLE_PERMISSION_KEYS,
  PERMISSION_CATALOGUE,
  SUPER_ADMIN_ROLE_NAME,
  SYSTEM_ROLES,
} from '@mensah-rentals/rbac';
import { PrismaClient, UserStatus } from '@prisma/client';

const RBAC_SEED_LOCK_ID = 2_026_071_803;

export interface SeedResult {
  bootstrapRoleAssigned: boolean;
  permissions: number;
  roles: number;
}

export async function runRbacSeed(
  prisma: PrismaClient,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SeedResult> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${RBAC_SEED_LOCK_ID})`;
    await transaction.permission.createMany({
      data: PERMISSION_CATALOGUE.map(([key, description]) => ({
        description,
        key,
      })),
      skipDuplicates: true,
    });
    const permissions = await transaction.permission.findMany({
      select: { id: true, key: true },
    });
    const permissionIdByKey = new Map(
      permissions.map(({ id, key }) => [key, id]),
    );

    for (const definition of SYSTEM_ROLES) {
      let role = await transaction.role.findUnique({
        where: { name: definition.name },
      });
      const wasCreated = !role;
      if (!role) {
        role = await transaction.role.create({
          data: { ...definition, isSystem: true },
        });
      } else if (!role.isSystem) {
        throw new Error(
          `Reserved role ${definition.name} exists as a custom role.`,
        );
      }
      if (wasCreated || definition.name === SUPER_ADMIN_ROLE_NAME) {
        await transaction.rolePermission.createMany({
          data: DEFAULT_ROLE_PERMISSION_KEYS[definition.name].map((key) => {
            const permissionId = permissionIdByKey.get(key);
            if (!permissionId)
              throw new Error(`Seed permission is missing: ${key}`);
            return { permissionId, roleId: role.id };
          }),
          skipDuplicates: true,
        });
      }
    }

    let bootstrapRoleAssigned = false;
    const bootstrapEmail =
      environment.STAFF_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    if (environment.NODE_ENV === 'development' && bootstrapEmail) {
      const bootstrapUser = await transaction.user.findUnique({
        include: { roles: true },
        where: { email: bootstrapEmail },
      });
      const superAdmin = await transaction.role.findUnique({
        where: { name: SUPER_ADMIN_ROLE_NAME },
      });
      if (
        bootstrapUser?.status === UserStatus.ACTIVE &&
        bootstrapUser.roles.length === 0 &&
        superAdmin
      ) {
        await transaction.userRole.create({
          data: { roleId: superAdmin.id, userId: bootstrapUser.id },
        });
        bootstrapRoleAssigned = true;
      }
    }
    return {
      bootstrapRoleAssigned,
      permissions: await transaction.permission.count(),
      roles: await transaction.role.count({ where: { isSystem: true } }),
    };
  });
}
