import { proxyCatalogue, type CatalogueResource } from '@/lib/catalogue-proxy';
function validResource(value: string): value is CatalogueResource {
  return value === 'categories' || value === 'products';
}
function validId(value: string) {
  return /^c[a-z0-9]{20,40}$/.test(value);
}
async function handle(
  request: Request,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  const { resource, id } = await context.params;
  return validResource(resource) && validId(id)
    ? proxyCatalogue(request, resource, `/${encodeURIComponent(id)}`)
    : Response.json({ message: 'Not found' }, { status: 404 });
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
