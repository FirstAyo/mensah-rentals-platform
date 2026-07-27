import { proxyRentalRequest } from '@/lib/rental-request-proxy';

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxyRentalRequest(request, path);
}

export const DELETE = proxy;
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
