import { proxyQuote } from '@/lib/quote-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, context: Context) {
  return proxyQuote(request, (await context.params).path ?? []);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
