import { proxyChangeRequest } from '@/lib/change-request-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, context: Context) {
  return proxyChangeRequest(request, (await context.params).path ?? []);
}
export const GET = handle;
export const PUT = handle;
