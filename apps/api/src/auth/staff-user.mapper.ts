import type { StaffUserResponse } from '@mensah-rentals/types';

interface SafeStaffUserRecord {
  createdAt: Date;
  email: string;
  firstName: string;
  id: string;
  lastLoginAt: Date | null;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED';
  updatedAt: Date;
}

export function mapStaffUser(record: SafeStaffUserRecord): StaffUserResponse {
  return {
    createdAt: record.createdAt.toISOString(),
    email: record.email,
    firstName: record.firstName,
    id: record.id,
    lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
    lastName: record.lastName,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}
