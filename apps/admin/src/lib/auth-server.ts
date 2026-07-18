import 'server-only';

import type {
  StaffAuthResponse,
  StaffUserResponse,
} from '@mensah-rentals/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getApiInternalUrl, getStaffSessionCookieName } from './auth-config';

function isStaffAuthResponse(value: unknown): value is StaffAuthResponse {
  if (!value || typeof value !== 'object' || !('user' in value)) {
    return false;
  }

  const user = value.user;
  if (!user || typeof user !== 'object') {
    return false;
  }

  return (
    'id' in user &&
    typeof user.id === 'string' &&
    'email' in user &&
    typeof user.email === 'string'
  );
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
  return isStaffAuthResponse(body) ? body.user : null;
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
