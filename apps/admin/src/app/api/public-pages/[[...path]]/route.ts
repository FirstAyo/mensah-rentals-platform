import { proxyPublicPages } from '@/lib/public-pages-proxy';

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxyPublicPages(request, path);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
