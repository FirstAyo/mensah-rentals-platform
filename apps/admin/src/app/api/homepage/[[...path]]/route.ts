import { proxyHomepage } from '@/lib/homepage-proxy';

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxyHomepage(request, path);
}

export const DELETE = proxy;
export const GET = proxy;
export const POST = proxy;
