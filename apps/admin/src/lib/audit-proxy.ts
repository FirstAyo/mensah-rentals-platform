import {
  adminMutationOrigin,
  allowQuery,
  namedSessionCookie,
  privateHeaders,
  proxyCsv,
  proxyValidatedJson,
  readBoundedBody,
  safeApiUrl,
  validateMutation,
} from './phase18-proxy-shared';
import { parseAuditEntry, parseAuditResponse } from './audit-types';

const id = /^[a-z0-9:_-]+$/i;
const queryKeys = new Set([
  'preset',
  'startDate',
  'endDate',
  'page',
  'pageSize',
  'search',
  'actorUserId',
  'domain',
  'action',
  'sortDirection',
]);

export async function proxyAudit(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const exportRequest = segments.length === 1 && segments[0] === 'export';
  const detailRequest =
    segments.length === 2 &&
    id.test(segments[0] ?? '') &&
    id.test(segments[1] ?? '');
  const listRequest = segments.length === 0;
  if (
    (!exportRequest && !detailRequest && !listRequest) ||
    request.method !== (exportRequest ? 'POST' : 'GET')
  )
    return Response.json(
      { message: 'Audit route not allowed' },
      { status: 404, headers: privateHeaders() },
    );
  const query = allowQuery(request, queryKeys);
  if (!query)
    return Response.json(
      { message: 'Audit query is not allowed' },
      { status: 400, headers: privateHeaders() },
    );
  let body: string | undefined;
  if (exportRequest) {
    const invalid = validateMutation(request);
    if (invalid) return invalid;
    const bounded = await readBoundedBody(request);
    if (bounded === null)
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413, headers: privateHeaders() },
      );
    body = bounded;
  }
  const headers = new Headers({
    Accept: exportRequest ? 'text/csv' : 'application/json',
  });
  const session = namedSessionCookie(request);
  if (session) headers.set('Cookie', session);
  if (exportRequest) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', adminMutationOrigin());
  }
  const suffix = exportRequest
    ? '/export'
    : detailRequest
      ? `/${segments[0]}/${segments[1]}`
      : '';
  try {
    const upstream = await fetcher(
      safeApiUrl(`/admin/audit${suffix}`, query.toString()),
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
      },
    );
    if (exportRequest) return proxyCsv(upstream, 'mensah-rentals-audit.csv');
    return detailRequest
      ? proxyValidatedJson(
          upstream,
          'Audit service returned an unsafe response',
          parseAuditEntry,
        )
      : proxyValidatedJson(
          upstream,
          'Audit service returned an unsafe response',
          parseAuditResponse,
        );
  } catch {
    return Response.json(
      { message: 'Audit service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
