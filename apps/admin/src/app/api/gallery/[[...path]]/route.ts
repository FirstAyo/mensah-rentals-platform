import { proxyGallery } from '@/lib/gallery-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context) {
  return proxyGallery(request, (await context.params).path ?? []);
}

export const GET = proxy;
export const POST = proxy;
