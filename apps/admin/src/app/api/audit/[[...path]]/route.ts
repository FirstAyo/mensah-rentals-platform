import { proxyAudit } from '@/lib/audit-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(request: Request, context: Context) {
  return proxyAudit(request, (await context.params).path ?? []);
}
export const GET = proxy;
export const POST = proxy;
