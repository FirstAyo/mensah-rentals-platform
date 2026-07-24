import { proxyRentalRequest } from '@/lib/rental-request-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  return proxyRentalRequest(request, (await context.params).path ?? []);
}

export const GET = handle;
export const POST = handle;
