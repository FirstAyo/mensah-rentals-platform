import {
  allowQuery,
  namedSessionCookie,
  privateHeaders,
  proxyValidatedJson,
  safeApiUrl,
} from './phase18-proxy-shared';
import { parseBackupStatus, parseSystemStatus } from './system-status-types';

const paths = new Set(['status', 'backup-status']);

export async function proxySystemStatus(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const path = segments[0];
  if (
    request.method !== 'GET' ||
    segments.length !== 1 ||
    !path ||
    !paths.has(path)
  )
    return Response.json(
      { message: 'System route not allowed' },
      { status: 404, headers: privateHeaders() },
    );
  const query = allowQuery(request, new Set());
  if (!query)
    return Response.json(
      { message: 'System query is not allowed' },
      { status: 400, headers: privateHeaders() },
    );
  const headers = new Headers({ Accept: 'application/json' });
  const session = namedSessionCookie(request);
  if (session) headers.set('Cookie', session);
  try {
    const upstream = await fetcher(safeApiUrl(`/admin/system/${path}`), {
      headers,
      cache: 'no-store',
    });
    return path === 'status'
      ? proxyValidatedJson(
          upstream,
          'System service returned an unsafe response',
          parseSystemStatus,
        )
      : proxyValidatedJson(
          upstream,
          'System service returned an unsafe response',
          parseBackupStatus,
        );
  } catch {
    return Response.json(
      { message: 'System service is unavailable' },
      { status: 503, headers: privateHeaders() },
    );
  }
}
