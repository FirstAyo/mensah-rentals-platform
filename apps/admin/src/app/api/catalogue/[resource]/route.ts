import { proxyCatalogue, type CatalogueResource } from '@/lib/catalogue-proxy';

function valid(resource: string): resource is CatalogueResource {
  return resource === 'categories' || resource === 'products';
}
async function handle(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  return valid(resource)
    ? proxyCatalogue(request, resource)
    : Response.json({ message: 'Not found' }, { status: 404 });
}
export const GET = handle;
export const POST = handle;
