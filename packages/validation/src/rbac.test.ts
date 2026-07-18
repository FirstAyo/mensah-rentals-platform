import { describe, expect, it } from 'vitest';

import { replaceRolePermissionsSchema, replaceUserRolesSchema } from './index';

const firstId = 'clz1234567890abcdefghijk';
const secondId = 'clz1234567890abcdefghijl';

describe('RBAC validation', () => {
  it('accepts unique role and permission IDs, including an empty replacement', () => {
    expect(
      replaceUserRolesSchema.safeParse({ roleIds: [firstId, secondId] })
        .success,
    ).toBe(true);
    expect(
      replaceRolePermissionsSchema.safeParse({ permissionIds: [] }).success,
    ).toBe(true);
  });

  it('rejects duplicate and invalid IDs', () => {
    expect(
      replaceUserRolesSchema.safeParse({ roleIds: [firstId, firstId] }).success,
    ).toBe(false);
    expect(
      replaceRolePermissionsSchema.safeParse({ permissionIds: ['not-an-id'] })
        .success,
    ).toBe(false);
  });

  it('rejects unknown input fields', () => {
    expect(
      replaceUserRolesSchema.safeParse({ roleIds: [], isSuperAdmin: true })
        .success,
    ).toBe(false);
  });
});
