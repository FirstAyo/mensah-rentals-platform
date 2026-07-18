import 'server-only';

import type {
  StaffAuthResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getApiInternalUrl, getStaffSessionCookieName } from './auth-config';

function parseStaffAuthResponse(value: unknown): StaffAuthResponse | null {
  if (!value || typeof value !== 'object' || !('user' in value)) {
    return null;
  }

  const user = value.user;
  if (!user || typeof user !== 'object') {
    return null;
  }
  const record = user as Record<string, unknown>;

  const requiredStrings = [
    'id',
    'email',
    'firstName',
    'lastName',
    'status',
    'createdAt',
    'updatedAt',
  ] as const;
  if (!requiredStrings.every((field) => typeof record[field] === 'string'))
    return null;
  if (record.lastLoginAt !== null && typeof record.lastLoginAt !== 'string')
    return null;
  if (
    !Array.isArray(record.permissionKeys) ||
    !record.permissionKeys.every((key) => typeof key === 'string')
  )
    return null;
  if (!Array.isArray(record.roles)) return null;
  const roles = record.roles.flatMap((role) => {
    if (!role || typeof role !== 'object') return [];
    if (
      !('id' in role) ||
      typeof role.id !== 'string' ||
      !('name' in role) ||
      typeof role.name !== 'string' ||
      !('displayName' in role) ||
      typeof role.displayName !== 'string'
    )
      return [];
    return [{ displayName: role.displayName, id: role.id, name: role.name }];
  });
  if (
    roles.length !== record.roles.length ||
    (record.status !== 'ACTIVE' && record.status !== 'DISABLED')
  )
    return null;
  return {
    user: {
      createdAt: record.createdAt as string,
      email: record.email as string,
      firstName: record.firstName as string,
      id: record.id as string,
      lastLoginAt: record.lastLoginAt as string | null,
      lastName: record.lastName as string,
      permissionKeys: [...new Set(record.permissionKeys as string[])].sort(),
      roles,
      status: record.status,
      updatedAt: record.updatedAt as string,
    },
  };
}

export async function requestCurrentStaffUser(
  cookieHeader: string,
  fetcher: typeof fetch = fetch,
): Promise<StaffUserResponse | null> {
  if (!cookieHeader) {
    return null;
  }

  const response = await fetcher(`${getApiInternalUrl()}/auth/me`, {
    cache: 'no-store',
    headers: { Cookie: cookieHeader },
  });
  if (!response.ok) {
    return null;
  }

  const body: unknown = await response.json();
  return parseStaffAuthResponse(body)?.user ?? null;
}

export async function getCurrentStaffUser(): Promise<StaffUserResponse | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getStaffSessionCookieName());
  const cookieHeader = cookie ? `${cookie.name}=${cookie.value}` : '';
  return requestCurrentStaffUser(cookieHeader);
}

export async function requireCurrentStaffUser(): Promise<StaffUserResponse> {
  const user = await getCurrentStaffUser();
  if (!user) {
    redirect('/login');
  }

  return user;
}
