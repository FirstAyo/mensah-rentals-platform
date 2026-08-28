import { proxyContactEnquiries } from '@/lib/contact-enquiries-proxy';

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, context: Context) {
  return proxyContactEnquiries(request, (await context.params).path ?? []);
}

export const GET = proxy;
export const PUT = proxy;
