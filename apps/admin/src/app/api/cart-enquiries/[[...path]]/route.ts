import { proxyCartEnquiries } from '@/lib/cart-enquiries-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context) {
  return proxyCartEnquiries(request, (await context.params).path ?? []);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
