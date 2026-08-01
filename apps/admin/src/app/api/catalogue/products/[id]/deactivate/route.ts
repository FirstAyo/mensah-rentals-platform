import { proxyCatalogue } from '@/lib/catalogue-proxy';

function validId(value: string) {
  return /^c[a-z0-9]{20,40}$/.test(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return validId(id)
    ? proxyCatalogue(
        request,
        'products',
        `/${encodeURIComponent(id)}/deactivate`,
      )
    : Response.json({ message: 'Not found' }, { status: 404 });
}
