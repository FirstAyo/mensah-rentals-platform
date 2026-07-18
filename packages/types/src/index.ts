export interface ApiHealthResponse {
  service: 'mensah-rentals-api';
  status: 'ok';
}

export interface DatabaseHealthResponse {
  database: 'connected';
  status: 'ok';
}

export type StaffUserStatus = 'ACTIVE' | 'DISABLED';

export interface StaffRoleSummary {
  displayName: string;
  id: string;
  name: string;
}

export interface StaffUserResponse {
  createdAt: string;
  email: string;
  firstName: string;
  id: string;
  lastLoginAt: string | null;
  lastName: string;
  permissionKeys: string[];
  roles: StaffRoleSummary[];
  status: StaffUserStatus;
  updatedAt: string;
}

export interface PermissionResponse {
  createdAt: string;
  description: string;
  id: string;
  key: string;
}

export interface RoleResponse extends StaffRoleSummary {
  createdAt: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  updatedAt: string;
}

export interface RoleDetailResponse extends RoleResponse {
  permissions: PermissionResponse[];
}

export interface StaffAuthResponse {
  user: StaffUserResponse;
}
