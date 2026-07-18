import type { StaffUserResponse, StaffUserStatus } from '@mensah-rentals/types';
import type { Request } from 'express';

export interface StaffCredentialRecord {
  createdAt: Date;
  email: string;
  firstName: string;
  id: string;
  lastLoginAt: Date | null;
  lastName: string;
  passwordHash: string;
  roles: SafeUserRoleRecord[];
  status: StaffUserStatus;
  updatedAt: Date;
}

export interface SafeUserRoleRecord {
  role: {
    displayName: string;
    id: string;
    name: string;
    permissions: Array<{ permission: { key: string } }>;
  };
}

export interface ValidStaffSession {
  sessionId: string;
  user: StaffUserResponse;
}

export interface AuthenticatedStaffRequest extends Request {
  staffSessionId?: string;
  staffUser?: StaffUserResponse;
}

export interface LoginResult {
  expiresAt: Date;
  rawToken: string;
  user: StaffUserResponse;
}
