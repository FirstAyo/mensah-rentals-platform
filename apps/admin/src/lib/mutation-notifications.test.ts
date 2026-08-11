import { describe, expect, it } from 'vitest';
import {
  mutationNotificationFor,
  responseErrorMessage,
} from './mutation-notifications';

describe('admin mutation notifications', () => {
  it.each([
    ['PATCH', '/api/inventory/inv-1', 'Inventory updated successfully'],
    [
      'POST',
      '/api/inventory/inv-1/stock-additions',
      'Stock added successfully',
    ],
    [
      'POST',
      '/api/inventory/inv-1/stock-reductions',
      'Inventory reduced successfully',
    ],
    [
      'POST',
      '/api/inventory/inv-1/items',
      'Serialized asset added successfully',
    ],
    ['POST', '/api/inventory/inv-1/archive', 'Inventory archived successfully'],
    ['POST', '/api/inventory/inv-1/restore', 'Inventory restored successfully'],
    ['DELETE', '/api/inventory/inv-1', 'Inventory deleted successfully'],
  ])('maps %s %s to its exact success message', (method, path, expected) => {
    expect(mutationNotificationFor(method, path)?.success).toBe(expected);
  });

  it.each([
    ['/api/catalogue/products/one', 'Catalogue updated successfully'],
    [
      '/api/rental-requests/one/assignment',
      'Rental request updated successfully',
    ],
    ['/api/quotes/one/send', 'Quote updated successfully'],
    ['/api/orders/one/fulfilment', 'Order workflow updated successfully'],
    ['/api/returns/one', 'Return workflow updated successfully'],
    [
      '/api/maintenance/work-orders',
      'Maintenance workflow updated successfully',
    ],
    ['/api/homepage/drafts', 'Homepage content updated successfully'],
  ])(
    'covers a representative mutation architecture for %s',
    (path, expected) => {
      expect(mutationNotificationFor('POST', path)?.success).toBe(expected);
    },
  );

  it('ignores reads and authentication transport', () => {
    expect(mutationNotificationFor('GET', '/api/inventory')).toBeNull();
    expect(mutationNotificationFor('POST', '/api/auth/login')).toBeNull();
  });

  it('uses safe API errors and a meaningful fallback', () => {
    expect(
      responseErrorMessage({ message: 'Stock is committed.' }, 'Failed'),
    ).toBe('Stock is committed.');
    expect(responseErrorMessage(null, 'Inventory update failed')).toBe(
      'Inventory update failed. Please try again.',
    );
  });
});
