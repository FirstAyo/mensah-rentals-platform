import { proxyCatalogue } from '@/lib/catalogue-proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCatalogue(request, 'categories', `/${id}/cover-image`);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCatalogue(request, 'categories', `/${id}/cover-image`);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCatalogue(request, 'categories', `/${id}/cover-image`);
}
