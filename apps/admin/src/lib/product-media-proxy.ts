import {
  getAdminOrigin,
  getApiInternalUrl,
  getStaffSessionCookieName,
} from './auth-config';
import { PRODUCT_IMAGE_LIMITS } from '@mensah-rentals/validation';

const idPattern = /^[a-z0-9]+$/;
const maxMultipartBytes = PRODUCT_IMAGE_LIMITS.maxSourceBytes + 64 * 1024;

async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxMultipartBytes) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxMultipartBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function namedCookie(request: Request) {
  const name = getStaffSessionCookieName();
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`)) ?? null
  );
}

export async function proxyProductMedia(
  request: Request,
  productId: string,
  imageId?: string,
  fetcher: typeof fetch = fetch,
) {
  if (!idPattern.test(productId) || (imageId && !idPattern.test(imageId)))
    return Response.json({ message: 'Invalid identifier' }, { status: 400 });
  const allowed = imageId ? new Set(['PUT', 'DELETE']) : new Set(['POST']);
  if (!allowed.has(request.method))
    return Response.json({ message: 'Method not allowed' }, { status: 405 });
  if (request.headers.get('origin') !== getAdminOrigin())
    return Response.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  const headers = new Headers({ Origin: getAdminOrigin() });
  const cookie = namedCookie(request);
  if (cookie) headers.set('Cookie', cookie);
  const incomingType = request.headers.get('content-type') ?? '';
  if (request.method === 'POST') {
    if (!incomingType.toLowerCase().startsWith('multipart/form-data;'))
      return Response.json(
        { message: 'Multipart image data is required' },
        { status: 415 },
      );
    headers.set('Content-Type', incomingType);
  } else if (request.method === 'PUT') {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const body =
      request.method === 'DELETE' ? undefined : await readBoundedBody(request);
    if (body === null)
      return Response.json(
        { message: 'Image upload exceeds the allowed request size' },
        { status: 413 },
      );
    const upstream = await fetcher(
      `${getApiInternalUrl()}/admin/products/${productId}/images${imageId ? `/${imageId}` : ''}`,
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
      { message: 'Product media service is unavailable' },
      { status: 503 },
    );
  }
}
