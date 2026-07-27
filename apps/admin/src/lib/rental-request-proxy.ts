import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';

const identifier = '[a-z0-9]+';
const routes = [
  { pattern: /^$/, methods: new Set(['GET']) },
  { pattern: /^assignees$/, methods: new Set(['GET']) },
  { pattern: new RegExp(`^${identifier}$`), methods: new Set(['GET']) },
  {
    pattern: new RegExp(`^${identifier}/assignment$`),
    methods: new Set(['PUT', 'DELETE']),
  },
  {
    pattern: new RegExp(`^${identifier}/notes$`),
    methods: new Set(['GET', 'POST']),
  },
  {
    pattern: new RegExp(`^${identifier}/review-state$`),
    methods: new Set(['PUT']),
  },
  {
    pattern: new RegExp(`^${identifier}/activity$`),
    methods: new Set(['GET']),
  },
  {
    pattern: new RegExp(`^${identifier}/decision$`),
    methods: new Set(['GET']),
  },
  {
    pattern: new RegExp(`^${identifier}/decisions$`),
    methods: new Set(['GET']),
  },
  {
    pattern: new RegExp(
      `^${identifier}/decisions/(approve|partially-approve|reject)$`,
    ),
    methods: new Set(['POST']),
  },
] as const;

const queryKeys = new Set([
  'page',
  'pageSize',
  'search',
  'status',
  'assignment',
  'assignedToUserId',
  'fulfillmentMethod',
  'rentalStartFrom',
  'rentalStartTo',
  'sortBy',
  'sortDirection',
]);
const maximumMutationBodyBytes = 16 * 1024;

export async function proxyRentalRequest(
  request: Request,
  segments: string[],
  fetcher: typeof fetch = fetch,
) {
  const path = segments.join('/');
  const allowed = routes.some(
    ({ methods, pattern }) => pattern.test(path) && methods.has(request.method),
  );
  if (!allowed) {
    return Response.json(
      { message: 'Rental request route not allowed' },
      { status: 404 },
    );
  }

  const unsafe = request.method !== 'GET';
  if (unsafe && request.headers.get('origin') !== getAdminOrigin()) {
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  }

  let body: string | undefined;
  if (unsafe) {
    const mediaType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== 'application/json') {
      return Response.json(
        { message: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }
    const declaredLength = request.headers.get('content-length');
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > maximumMutationBodyBytes)
    ) {
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    }
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maximumMutationBodyBytes) {
      return Response.json(
        { message: 'Request body is too large' },
        { status: 413 },
      );
    }
  }

  const headers = new Headers();
  const cookieName = getStaffSessionCookieName();
  const sessionCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (sessionCookie) headers.set('Cookie', sessionCookie);
  if (unsafe) {
    headers.set('Content-Type', 'application/json');
    headers.set('Origin', getAdminOrigin());
  }

  const incoming = new URL(request.url);
  const query = new URLSearchParams();
  for (const [key, value] of incoming.searchParams) {
    if (queryKeys.has(key)) query.append(key, value);
  }

  try {
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/rental-requests${path ? `/${path}` : ''}${query.size ? `?${query}` : ''}`,
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch {
    return Response.json(
      { message: 'Rental request service is unavailable' },
      { status: 503 },
    );
  }
}
