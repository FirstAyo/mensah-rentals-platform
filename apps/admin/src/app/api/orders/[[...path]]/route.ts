import { proxyOrder } from '@/lib/order-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  return proxyOrder(request, (await context.params).path ?? []);
}

export const GET = handle;
