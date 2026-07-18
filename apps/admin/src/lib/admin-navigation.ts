export interface AdminNavigationItem {
  label: string;
  requiredPermission?: string;
}

export const ADMIN_NAVIGATION: readonly AdminNavigationItem[] = [
  { label: 'Dashboard' },
  { label: 'Products', requiredPermission: 'product.view' },
  { label: 'Inventory', requiredPermission: 'inventory.view' },
  { label: 'Rental Requests', requiredPermission: 'rental_request.view' },
  { label: 'Quotes', requiredPermission: 'quote.view' },
  { label: 'Users', requiredPermission: 'user.view' },
  { label: 'Roles', requiredPermission: 'role.view' },
];

export function visibleAdminNavigation(
  permissionKeys: readonly string[],
): AdminNavigationItem[] {
  const effective = new Set(permissionKeys);
  return ADMIN_NAVIGATION.filter(
    ({ requiredPermission }) =>
      !requiredPermission || effective.has(requiredPermission),
  );
}
