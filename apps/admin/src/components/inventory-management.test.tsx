import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, useQuery } = vi.hoisted(() => ({
  replace: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('./inventory-maintenance-links', () => ({
  InventoryMaintenanceLinks: () => <div>Maintenance links</div>,
}));

import { InventoryDetail } from './inventory-detail';
import { InventoryList } from './inventory-list';

const refetch = vi.fn();

describe('Phase 18.3 inventory management UI', () => {
  beforeEach(() => {
    useQuery.mockReset();
    refetch.mockReset();
  });

  it('renders lifecycle filters and an archived status without exposing create to a read-only user', () => {
    useQuery.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        if (queryKey[0] === 'inventory')
          return {
            data: {
              items: [
                {
                  archivedAt: '2026-08-10T00:00:00.000Z',
                  createdAt: '2026-08-01T00:00:00.000Z',
                  id: 'inventory-one',
                  internalNotes: null,
                  isActive: false,
                  product: { id: 'product-one', name: 'Chair', slug: 'chair' },
                  trackingMode: 'BULK',
                  updatedAt: '2026-08-10T00:00:00.000Z',
                },
              ],
              meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
            },
            isError: false,
            isLoading: false,
            refetch,
          };
        return { data: undefined, isError: false, isLoading: false, refetch };
      },
    );

    const html = renderToStaticMarkup(
      <InventoryList canAdjust={false} canViewQuantity={false} />,
    );
    expect(html).toContain('Inventory status filter');
    expect(html).toContain('All inventory');
    expect(html).toContain('Archived');
    expect(html).not.toContain('Create inventory');
  });

  it('shows only bulk stock actions for active bulk inventory', () => {
    useQuery.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const key = queryKey[0];
        if (key === 'inventory-detail')
          return {
            data: {
              archivedAt: null,
              createdAt: '2026-08-01T00:00:00.000Z',
              id: 'inventory-one',
              internalNotes: 'Warehouse row A',
              isActive: true,
              product: { id: 'product-one', name: 'Chair', slug: 'chair' },
              trackingMode: 'BULK',
              updatedAt: '2026-08-10T00:00:00.000Z',
            },
            isError: false,
            isLoading: false,
            refetch,
          };
        if (key === 'inventory-quantity')
          return {
            data: {
              inventoryId: 'inventory-one',
              states: {
                DAMAGED: 0,
                LOST: 0,
                MAINTENANCE: 0,
                MISSING: 0,
                RENTABLE: 20,
                RENTED: 0,
                RETIRED: 0,
              },
              totalQuantity: 20,
            },
            isError: false,
            isLoading: false,
            refetch,
          };
        if (key === 'inventory-lifecycle')
          return {
            data: {
              archiveBlockers: ['Physical stock remains.'],
              canArchive: false,
              canHardDelete: false,
              canRestore: false,
              hardDeleteBlockers: ['Physical stock remains.'],
              inventoryId: 'inventory-one',
              isActive: true,
              restoreBlockers: [],
            },
            isError: false,
            isLoading: false,
            refetch,
          };
        return { data: undefined, isError: false, isLoading: false, refetch };
      },
    );

    const html = renderToStaticMarkup(
      <InventoryDetail
        canAdjust
        canCreateMaintenance={false}
        canViewHistory={false}
        canViewInspections={false}
        canViewMaintenance={false}
        canViewQuantity
        id="inventory-one"
      />,
    );
    expect(html).toContain('Add stock');
    expect(html).toContain('Reduce / retire stock');
    expect(html).toContain('Inventory cannot be archived yet');
    expect(html).toContain('Delete / Archive');
    expect(html).toContain('Warehouse row A');
    expect(html).not.toContain('Add serialized asset');
  });
});
