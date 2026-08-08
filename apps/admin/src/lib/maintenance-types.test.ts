import { describe, expect, it } from 'vitest';
import {
  maintenanceSourceOptions,
  maintenanceSourceQuantity,
  type MaintenanceSourceTarget,
} from './maintenance-types';

describe('maintenance source targets', () => {
  it('preserves an issue quantity and exact serialized asset', () => {
    const source: MaintenanceSourceTarget = {
      assetNumber: 'CAM-101',
      eligible: true,
      inventoryId: 'inventory',
      inventoryItemId: 'asset',
      productName: 'Cinema camera',
      quantityAvailable: 1,
      serialNumber: 'SERIAL-101',
    };
    expect(maintenanceSourceQuantity(source)).toBe(1);
    expect(maintenanceSourceOptions(source)[0]?.inventoryItemId).toBe('asset');
  });

  it('offers only returned serialized targets supplied by the source API', () => {
    const source: MaintenanceSourceTarget = {
      eligible: true,
      inventoryId: 'inventory',
      productName: 'Camera',
      targets: [
        {
          assetNumber: 'CAM-201',
          inventoryItemId: 'asset-one',
          quantityAvailable: 1,
          serialNumber: null,
        },
        {
          assetNumber: 'CAM-202',
          inventoryItemId: 'asset-two',
          quantityAvailable: 1,
          serialNumber: 'SERIAL-202',
        },
      ],
    };
    expect(maintenanceSourceQuantity(source)).toBe(1);
    expect(
      maintenanceSourceOptions(source).map(
        ({ inventoryItemId }) => inventoryItemId,
      ),
    ).toEqual(['asset-one', 'asset-two']);
  });
});
