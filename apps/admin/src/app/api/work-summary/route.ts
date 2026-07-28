import {
  getApiInternalUrl,
  getStaffSessionCookieName,
} from '@/lib/auth-config';

export async function GET(request: Request) {
  const name = getStaffSessionCookieName();
  const session = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  const headers = new Headers({ Accept: 'application/json' });
  if (session) headers.set('Cookie', session);
  try {
    const upstream = await fetch(`${getApiInternalUrl()}/admin/work-summary`, {
      headers,
      cache: 'no-store',
    });
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
      { message: 'Work summary service is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
