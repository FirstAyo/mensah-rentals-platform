import { proxyFeatureSettings } from '@/lib/feature-settings-proxy';

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(request: Request, context: Context) {
  return proxyFeatureSettings(request, (await context.params).path ?? []);
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
