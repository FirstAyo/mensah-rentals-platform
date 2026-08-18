export const PRODUCTION_SITE_ORIGIN = 'https://mensahrentals.com';

function validatedOrigin(value: string, variable: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(`${variable} must be an HTTP(S) origin.`);
  return url.origin;
}

export function siteOrigin(): string {
  const value =
    process.env.SITE_URL ??
    (process.env.NODE_ENV === 'production'
      ? PRODUCTION_SITE_ORIGIN
      : (process.env.WEB_ORIGIN ?? 'http://localhost:3000'));
  const origin = validatedOrigin(value, 'SITE_URL');
  if (indexingEnabled() && origin !== PRODUCTION_SITE_ORIGIN)
    throw new Error(
      `Indexing may only be enabled for ${PRODUCTION_SITE_ORIGIN}.`,
    );
  return origin;
}

export function absoluteSiteUrl(path = '/'): string {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Site paths must start with one forward slash.');
  return new URL(path, `${siteOrigin()}/`).toString();
}

export function indexingEnabled() {
  return process.env.SITE_INDEXING_ENABLED === 'true';
}

export function publicPageRobots(indexable = true) {
  if (!indexingEnabled())
    return { index: false, follow: false, nocache: true } as const;
  return indexable
    ? ({ index: true, follow: true } as const)
    : ({ index: false, follow: true } as const);
}
