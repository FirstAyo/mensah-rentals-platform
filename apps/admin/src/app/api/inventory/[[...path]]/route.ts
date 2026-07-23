import { proxyInventory } from '@/lib/inventory-proxy';

async function handler(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  return proxyInventory(request, path);
}

export const GET = handler;
export const POST = handler;
