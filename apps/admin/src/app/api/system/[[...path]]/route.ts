import { proxySystemStatus } from '@/lib/system-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(request: Request, context: Context) {
  return proxySystemStatus(request, (await context.params).path ?? []);
}
export const GET = proxy;
