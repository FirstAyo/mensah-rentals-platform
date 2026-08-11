import type { AdminInventoryLifecycleResponse } from '@mensah-rentals/types';

export type InventoryLifecycleFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export function resultingQuantity(current: number, change: number) {
  return current + change;
}

export function lifecycleActionAvailability(
  lifecycle: AdminInventoryLifecycleResponse,
) {
  return {
    archive: lifecycle.isActive && lifecycle.canArchive,
    delete: lifecycle.isActive && lifecycle.canHardDelete,
    restore: !lifecycle.isActive && lifecycle.canRestore,
  };
}
