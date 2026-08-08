import { proxyReporting } from '@/lib/reporting-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(request: Request, context: Context) {
  return proxyReporting(request, (await context.params).path ?? []);
}
export const GET = proxy;
export const POST = proxy;
