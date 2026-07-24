function requiredOrigin(value: string | undefined, fallback: string): string {
  const url = new URL(value ?? fallback);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Rental request origins must be plain HTTP(S) origins.');
  return url.origin;
}

function cookieName(value: string | undefined, fallback: string): string {
  const name = value ?? fallback;
  if (!/^[A-Za-z0-9_-]+$/.test(name))
    throw new Error('Rental request cookie name is invalid.');
  return name;
}

export function rentalRequestConfig() {
  const production = process.env.NODE_ENV === 'production';
  const secure = process.env.PUBLIC_REQUEST_COOKIE_SECURE === 'true';
  const requestCookieName = cookieName(
    process.env.PUBLIC_REQUEST_COOKIE_NAME,
    'mensah_rental_request',
  );
  const cartCookieName = cookieName(
    process.env.PUBLIC_CART_COOKIE_NAME,
    'mensah_rental_cart',
  );
  if (production && (!secure || !requestCookieName.startsWith('__Host-')))
    throw new Error(
      'Production request cookies must be Secure and use the __Host- prefix.',
    );
  const ttlDays = Number(process.env.PUBLIC_REQUEST_TRACKING_TTL_DAYS ?? 180);
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365)
    throw new Error('Request tracking TTL must be between 1 and 365 days.');
  return {
    apiUrl: requiredOrigin(
      process.env.API_INTERNAL_URL,
      'http://localhost:4000',
    ),
    cartCookieName,
    requestCookieName,
    secure,
    ttlDays,
    webOrigin: requiredOrigin(process.env.WEB_ORIGIN, 'http://localhost:3000'),
  };
}
