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
    expect(PERMISSION_CATALOGUE).toHaveLength(45);
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
  });
  it('keeps owner-only role management out of ADMIN', () => {
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).not.toContain(
      'role.super_admin.manage',
    );
    expect(DEFAULT_ROLE_PERMISSION_KEYS.ADMIN).not.toContain(
      'user.role.manage',
    );
  });
});
