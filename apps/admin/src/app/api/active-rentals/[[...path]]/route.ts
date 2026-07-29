import { proxyActiveRental } from '@/lib/active-rental-proxy';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyActiveRental(request, (await context.params).path ?? []);
}
