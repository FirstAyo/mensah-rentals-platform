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
    throw new Error('Cart origins must be plain HTTP(S) origins.');
  return url.origin;
}

export function cartConfig() {
  const production = process.env.NODE_ENV === 'production';
  const secure = process.env.PUBLIC_CART_COOKIE_SECURE === 'true';
  const cookieName =
    process.env.PUBLIC_CART_COOKIE_NAME ?? 'mensah_rental_cart';
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName))
    throw new Error('PUBLIC_CART_COOKIE_NAME is invalid.');
  if (production && (!secure || !cookieName.startsWith('__Host-')))
    throw new Error(
      'Production cart cookies must be Secure and use the __Host- prefix.',
    );
  const ttlDays = Number(process.env.PUBLIC_CART_TTL_DAYS ?? 30);
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 90)
    throw new Error('PUBLIC_CART_TTL_DAYS must be between 1 and 90.');
  return {
    apiUrl: requiredOrigin(
      process.env.API_INTERNAL_URL,
      'http://localhost:4000',
    ),
    cookieName,
    secure,
    ttlDays,
    webOrigin: requiredOrigin(process.env.WEB_ORIGIN, 'http://localhost:3000'),
  };
}
