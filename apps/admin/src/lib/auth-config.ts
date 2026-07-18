export function getAdminOrigin(): string {
  return process.env.ADMIN_ORIGIN ?? 'http://localhost:3001';
}

export function getApiInternalUrl(): string {
  return process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
}

export function getStaffSessionCookieName(): string {
  return process.env.STAFF_SESSION_COOKIE_NAME ?? 'mensah_staff_session';
}

export function buildClearedStaffCookie(): string {
  const secure =
    process.env.AUTH_COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  return `${getStaffSessionCookieName()}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
