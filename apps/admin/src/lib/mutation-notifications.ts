export type MutationNotification = {
  error: string;
  success: string;
};

const INVENTORY_MESSAGES: Array<{
  matches: (method: string, path: string) => boolean;
  message: MutationNotification;
}> = [
  {
    matches: (method, path) =>
      method === 'POST' && path.endsWith('/stock-additions'),
    message: {
      success: 'Stock added successfully',
      error: 'Stock could not be added',
    },
  },
  {
    matches: (method, path) =>
      method === 'POST' && path.endsWith('/stock-reductions'),
    message: {
      success: 'Inventory reduced successfully',
      error: 'Inventory could not be reduced',
    },
  },
  {
    matches: (method, path) => method === 'POST' && path.endsWith('/items'),
    message: {
      success: 'Serialized asset added successfully',
      error: 'Serialized asset could not be added',
    },
  },
  {
    matches: (method, path) => method === 'POST' && path.endsWith('/archive'),
    message: {
      success: 'Inventory archived successfully',
      error: 'Inventory could not be archived',
    },
  },
  {
    matches: (method, path) => method === 'POST' && path.endsWith('/restore'),
    message: {
      success: 'Inventory restored successfully',
      error: 'Inventory could not be restored',
    },
  },
  {
    matches: (method, path) =>
      method === 'DELETE' && /^\/api\/inventory\/[^/]+$/.test(path),
    message: {
      success: 'Inventory deleted successfully',
      error: 'Inventory could not be deleted',
    },
  },
  {
    matches: (method, path) =>
      method === 'PATCH' && /^\/api\/inventory\/[^/]+$/.test(path),
    message: {
      success: 'Inventory updated successfully',
      error: 'Inventory could not be updated',
    },
  },
  {
    matches: (method, path) => method === 'POST' && path === '/api/inventory',
    message: {
      success: 'Inventory created successfully',
      error: 'Inventory could not be created',
    },
  },
  {
    matches: () => true,
    message: {
      success: 'Inventory operation completed successfully',
      error: 'Inventory operation failed',
    },
  },
];

const DOMAIN_MESSAGES: Array<[string, MutationNotification]> = [
  [
    '/api/feature-settings/presets',
    {
      success: 'Feature preset applied successfully',
      error: 'Feature preset could not be applied',
    },
  ],
  [
    '/api/feature-settings',
    {
      success: 'Feature updated successfully',
      error: 'Feature could not be updated',
    },
  ],
  [
    '/api/catalogue',
    {
      success: 'Catalogue updated successfully',
      error: 'Catalogue update failed',
    },
  ],
  [
    '/api/rental-requests',
    {
      success: 'Rental request updated successfully',
      error: 'Rental request update failed',
    },
  ],
  [
    '/api/quotes',
    { success: 'Quote updated successfully', error: 'Quote update failed' },
  ],
  [
    '/api/orders',
    {
      success: 'Order workflow updated successfully',
      error: 'Order workflow update failed',
    },
  ],
  [
    '/api/returns',
    {
      success: 'Return workflow updated successfully',
      error: 'Return workflow update failed',
    },
  ],
  [
    '/api/maintenance',
    {
      success: 'Maintenance workflow updated successfully',
      error: 'Maintenance workflow update failed',
    },
  ],
  [
    '/api/homepage',
    {
      success: 'Homepage content updated successfully',
      error: 'Homepage content update failed',
    },
  ],
  [
    '/api/issues',
    { success: 'Issue updated successfully', error: 'Issue update failed' },
  ],
  [
    '/api/roles',
    {
      success: 'Role settings updated successfully',
      error: 'Role update failed',
    },
  ],
  [
    '/api/users',
    {
      success: 'Staff user updated successfully',
      error: 'Staff user update failed',
    },
  ],
];

export function mutationNotificationFor(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod))
    return null;
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/')) return null;
  if (path.endsWith('/preview')) return null;
  if (path.startsWith('/api/inventory')) {
    return INVENTORY_MESSAGES.find(({ matches }) =>
      matches(normalizedMethod, path),
    )!.message;
  }
  return (
    DOMAIN_MESSAGES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? {
      success: 'Changes saved successfully',
      error: 'Changes could not be saved',
    }
  );
}

export function responseErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object')
    return `${fallback}. Please try again.`;
  const message = (value as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const first = message.find(
      (item) => typeof item === 'string' && item.trim(),
    );
    if (typeof first === 'string') return first.trim();
  }
  return `${fallback}. Please try again.`;
}
