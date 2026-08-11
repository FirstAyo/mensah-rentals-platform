import { describe, expect, it } from 'vitest';

import {
  lifecycleActionAvailability,
  resultingQuantity,
} from './inventory-management';

describe('inventory management presentation', () => {
  it('previews stock additions without editing the current total', () => {
    expect(resultingQuantity(20, 10)).toBe(30);
  });

  it('derives lifecycle actions from authoritative preflight flags', () => {
    expect(
      lifecycleActionAvailability({
        archiveBlockers: ['Stock remains'],
        canArchive: false,
        canRestore: true,
        canHardDelete: false,
        hardDeleteBlockers: ['History exists'],
        inventoryId: 'inventory-1',
        isActive: false,
        restoreBlockers: [],
      }),
    ).toEqual({ archive: false, delete: false, restore: true });
  });
});
