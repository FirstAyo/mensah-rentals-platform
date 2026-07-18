export function siteOrigin(): string {
  const value = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('WEB_ORIGIN must be an HTTP(S) origin.');
  return url.origin;
}
export function indexingEnabled() {
  return process.env.SITE_INDEXING_ENABLED === 'true';
}
