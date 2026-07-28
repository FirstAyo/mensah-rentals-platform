import { proxyRentalChangeRequest } from '@/lib/rental-change-request-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context) {
  return proxyRentalChangeRequest(request, (await context.params).path ?? []);
}

export const GET = handle;
export const POST = handle;
