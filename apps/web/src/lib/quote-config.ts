export function quoteConfig() {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const cookieName =
    process.env.PUBLIC_QUOTE_COOKIE_NAME ?? 'mensah_quote_access';
  const secure = process.env.PUBLIC_QUOTE_COOKIE_SECURE === 'true';
  const isolatedLocalTest =
    process.env.MENSAH_ISOLATED_E2E === 'verified-local-test-database';
  if (
    process.env.NODE_ENV === 'production' &&
    !isolatedLocalTest &&
    (!secure || !cookieName.startsWith('__Host-'))
  )
    throw new Error('Production quote cookies must be Secure and use __Host-');
  return { apiUrl, webOrigin, cookieName, secure };
}
