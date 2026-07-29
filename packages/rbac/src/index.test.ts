import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSION_KEYS,
  PERMISSION_CATALOGUE,
  SYSTEM_ROLES,
} from './index';

describe('RBAC catalogue', () => {
  it('contains unique permission keys and system role names', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    expect(new Set(SYSTEM_ROLES.map(({ name }) => name)).size).toBe(
      SYSTEM_ROLES.length,
    );
    expect(PERMISSION_CATALOGUE).toHaveLength(73);
  });
  it('grants SUPER_ADMIN every seeded permission', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SUPER_ADMIN).toEqual(
      ALL_PERMISSION_KEYS,
    );
  });
  it('keeps confidential and owner permissions out of EDITOR', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.EDITOR).not.toContain(
      'inventory.quantity.view',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.EDITOR).not.toContain(
      'role.manage_permissions',
    );
  });
  it('keeps role management out of SALES_PERSON', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'user.role.manage',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'role.manage_permissions',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'inventory.reservation.view',
    );
  });

  it('seeds fulfilment authority without granting checkout to sales or editor roles', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).toContain('fulfilment.checkout');
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).toContain(
      'fulfilment.view',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'fulfilment.checkout',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.EDITOR).not.toContain(
      'fulfilment.view',
    );
  });
  it('keeps owner-only role management out of ADMIN', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).not.toContain(
      'role.super_admin.manage',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).not.toContain(
      'user.role.manage',
    );
  });
  it('grants return authority by least privilege', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).toContain('return.complete');
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).toContain(
      'rental_issue.resolve',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).toContain('return.view');
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'return.create',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.SALES_PERSON).not.toContain(
      'rental_issue.view',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.EDITOR).not.toContain('return.view');
  });
});
