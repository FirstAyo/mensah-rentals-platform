import { proxyProductMedia } from '@/lib/product-media-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyProductMedia(request, id);
}
