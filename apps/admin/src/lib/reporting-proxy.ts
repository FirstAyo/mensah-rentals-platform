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
import { parseReportResponse } from './reporting-types';

const reportKeys = new Set([
  'overview',
  'rental-requests',
  'quotes-orders',
  'rentals-returns',
  'inventory',
  'maintenance',
]);
const queryKeys = new Set([
  'startDate',
  'endDate',
  'preset',
  'page',
  'pageSize',
  'search',
  'status',
  'productId',
  'categoryId',
  'quoteStatus',
  'recordType',
  'action',
  'trackingMode',
  'priority',
  'overdue',
  'sortBy',
  'sortDirection',
]);

export async function proxyReporting(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const [key, action] = segments;
  const exportRequest = action === 'export';
  if (
    !key ||
    !reportKeys.has(key) ||
    segments.length !== (exportRequest ? 2 : 1) ||
    request.method !== (exportRequest ? 'POST' : 'GET')
  )
    return Response.json(
      { message: 'Report route not allowed' },
      { status: 404, headers: privateHeaders() },
    );
  const query = allowQuery(request, queryKeys);
  if (!query)
    return Response.json(
      { message: 'Report query is not allowed' },
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
  try {
    const upstream = await fetcher(
      safeApiUrl(
        `/admin/reports/${key}${exportRequest ? '/export' : ''}`,
        query.toString(),
      ),
      { method: request.method, headers, body, cache: 'no-store' },
    );
    return exportRequest
      ? proxyCsv(upstream, `mensah-rentals-${key}.csv`)
      : proxyValidatedJson(
          upstream,
          'Report service returned an unsafe response',
          parseReportResponse,
        );
  } catch {
    return Response.json(
      { message: 'Reporting service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
