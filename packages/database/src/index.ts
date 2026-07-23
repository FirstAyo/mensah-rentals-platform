import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  mensahPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.mensahPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.mensahPrisma = prisma;
}

export { runRbacSeed } from './rbac-seed';

export {
  InventoryState,
  InventoryTrackingMode,
  InventoryTransactionKind,
  UserStatus,
} from '@prisma/client';
export type { Prisma, PrismaClient } from '@prisma/client';
