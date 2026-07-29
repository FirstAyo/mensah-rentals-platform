import { proxyReturnDomain } from '@/lib/return-proxy';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return proxyReturnDomain(
    'returns',
    request,
    (await context.params).path ?? [],
  );
}
export async function POST(request: Request, context: Context) {
  return proxyReturnDomain(
    'returns',
    request,
    (await context.params).path ?? [],
  );
}
