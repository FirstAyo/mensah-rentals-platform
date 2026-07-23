import { proxyProductMedia } from '@/lib/product-media-proxy';

async function proxy(
  request: Request,
  context: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await context.params;
  return proxyProductMedia(request, id, imageId);
}

export const PUT = proxy;
export const DELETE = proxy;
