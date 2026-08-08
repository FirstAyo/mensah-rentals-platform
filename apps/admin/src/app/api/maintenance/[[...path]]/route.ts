import { proxyMaintenance } from '@/lib/maintenance-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context) {
  return proxyMaintenance(request, (await context.params).path ?? []);
}

export const GET = proxy;
export const POST = proxy;
