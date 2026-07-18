import { proxyCatalogue, type CatalogueResource } from '@/lib/catalogue-proxy';
export async function POST(
  request: Request,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  const { resource, id } = await context.params;
  const validResource = resource === 'categories' || resource === 'products';
  return validResource && /^c[a-z0-9]{20,40}$/.test(id)
    ? proxyCatalogue(
        request,
        resource as CatalogueResource,
        `/${encodeURIComponent(id)}/activate`,
      )
    : Response.json({ message: 'Not found' }, { status: 404 });
}
