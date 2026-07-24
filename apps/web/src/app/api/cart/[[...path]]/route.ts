import { proxyCart } from '@/lib/cart-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  return proxyCart(request, (await context.params).path ?? []);
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
