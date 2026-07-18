import type { StaffUserResponse } from '@mensah-rentals/types';

interface SafeStaffUserRecord {
  createdAt: Date;
  email: string;
  firstName: string;
  id: string;
  lastLoginAt: Date | null;
  lastName: string;
  roles: Array<{
    role: {
      displayName: string;
      id: string;
      name: string;
      permissions: Array<{ permission: { key: string } }>;
    };
  }>;
  status: 'ACTIVE' | 'DISABLED';
  updatedAt: Date;
}

export function mapStaffUser(record: SafeStaffUserRecord): StaffUserResponse {
  const roles = record.roles
    .map(({ role }) => ({
      displayName: role.displayName,
      id: role.id,
      name: role.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const permissionKeys = [
    ...new Set(
      record.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key),
      ),
    ),
  ].sort();
  return {
    createdAt: record.createdAt.toISOString(),
    email: record.email,
    firstName: record.firstName,
    id: record.id,
    lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
    lastName: record.lastName,
    permissionKeys,
    roles,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}
