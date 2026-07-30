import { proxyCatalogue } from '@/lib/catalogue-proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return /^c[a-z0-9]{20,40}$/.test(id)
    ? proxyCatalogue(
        request,
        'categories',
        `/${encodeURIComponent(id)}/deactivate`,
      )
    : Response.json({ message: 'Not found' }, { status: 404 });
}
