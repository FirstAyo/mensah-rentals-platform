export const PERMISSION_CATALOGUE = [
  ['product.view', 'View products and public product information.'],
  ['product.create', 'Create products.'],
  ['product.update', 'Update products.'],
  ['product.delete', 'Delete or archive products.'],
  ['category.view', 'View product categories.'],
  ['category.create', 'Create product categories.'],
  ['category.update', 'Update product categories.'],
  ['category.delete', 'Delete or archive product categories.'],
  ['inventory.view', 'View internal inventory records.'],
  ['inventory.quantity.view', 'View confidential inventory quantities.'],
  ['inventory.adjust', 'Adjust internal inventory.'],
  ['inventory.transaction.view', 'View inventory transaction history.'],
  ['rental_request.view', 'View rental requests.'],
  ['rental_request.assign', 'Assign rental requests.'],
  ['rental_request.update', 'Update rental requests.'],
  ['rental_request.approve', 'Approve rental requests.'],
  ['rental_request.partially_approve', 'Partially approve rental requests.'],
  ['rental_request.reject', 'Reject rental requests.'],
  ['quote.view', 'View quotes.'],
  ['quote.create', 'Create quotes.'],
  ['quote.update', 'Update quotes.'],
  ['quote.send', 'Send quotes to customers.'],
  ['quote.approve', 'Approve protected quote actions.'],
  ['order.view', 'View confirmed rental orders.'],
  ['order.create', 'Create confirmed rental orders.'],
  ['order.update', 'Update confirmed rental orders.'],
  ['customer.view', 'View customer records needed for staff work.'],
  ['customer.update', 'Update customer records.'],
  ['user.view', 'View staff users.'],
  ['user.create', 'Create staff users.'],
  ['user.update', 'Update staff users.'],
  ['user.delete', 'Delete or archive staff users.'],
  ['user.role.manage', 'Assign and remove staff roles.'],
  ['role.view', 'View roles and the permission catalogue.'],
  ['role.create', 'Create custom roles.'],
  ['role.update', 'Update custom role metadata.'],
  ['role.delete', 'Delete or archive custom roles.'],
  ['role.manage_permissions', 'Change role-to-permission assignments.'],
  [
    'role.super_admin.manage',
    'Assign or remove the protected SUPER_ADMIN role.',
  ],
  ['content.view', 'View website content.'],
  ['content.create', 'Create website content.'],
  ['content.update', 'Update website content.'],
  ['content.delete', 'Delete or archive website content.'],
  ['report.view', 'View protected reports.'],
  ['audit_log.view', 'View audit logs.'],
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number][0];
export const ALL_PERMISSION_KEYS = PERMISSION_CATALOGUE.map(([key]) => key);

export const SYSTEM_ROLES = [
  {
    description: 'Protected owner-level role with every seeded permission.',
    displayName: 'Super Admin',
    name: 'SUPER_ADMIN',
  },
  {
    description:
      'Broad operational administration without owner-only RBAC powers.',
    displayName: 'Admin',
    name: 'ADMIN',
  },
  {
    description: 'Public product, category, and website content management.',
    displayName: 'Editor',
    name: 'EDITOR',
  },
  {
    description: 'Customer rental-request and quotation sales workflows.',
    displayName: 'Sales Person',
    name: 'SALES_PERSON',
  },
] as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[number]['name'];

const ADMIN_PERMISSIONS = [
  'product.view',
  'product.create',
  'product.update',
  'product.delete',
  'category.view',
  'category.create',
  'category.update',
  'category.delete',
  'inventory.view',
  'inventory.quantity.view',
  'inventory.adjust',
  'inventory.transaction.view',
  'rental_request.view',
  'rental_request.assign',
  'rental_request.update',
  'rental_request.approve',
  'rental_request.partially_approve',
  'rental_request.reject',
  'quote.view',
  'quote.create',
  'quote.update',
  'quote.send',
  'quote.approve',
  'order.view',
  'order.create',
  'order.update',
  'customer.view',
  'customer.update',
  'user.view',
  'user.create',
  'user.update',
  'role.view',
  'content.view',
  'content.create',
  'content.update',
  'content.delete',
  'report.view',
] as const satisfies readonly PermissionKey[];

const EDITOR_PERMISSIONS = [
  'product.view',
  'product.create',
  'product.update',
  'product.delete',
  'category.view',
  'category.create',
  'category.update',
  'category.delete',
  'content.view',
  'content.create',
  'content.update',
  'content.delete',
] as const satisfies readonly PermissionKey[];

const SALES_PERSON_PERMISSIONS = [
  'product.view',
  'category.view',
  'inventory.view',
  'inventory.quantity.view',
  'rental_request.view',
  'rental_request.assign',
  'rental_request.update',
  'quote.view',
  'quote.create',
  'quote.update',
  'quote.send',
  'customer.view',
  'customer.update',
] as const satisfies readonly PermissionKey[];

export const DEFAULT_ROLE_PERMISSION_KEYS = {
  ADMIN: ADMIN_PERMISSIONS,
  EDITOR: EDITOR_PERMISSIONS,
  SALES_PERSON: SALES_PERSON_PERMISSIONS,
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
} satisfies Record<SystemRoleName, readonly PermissionKey[]>;

export const SUPER_ADMIN_ROLE_NAME = 'SUPER_ADMIN' as const;
export const SUPER_ADMIN_MANAGE_PERMISSION = 'role.super_admin.manage' as const;

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(value);
}
