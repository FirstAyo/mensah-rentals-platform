import 'server-only';

import { listCategories } from './public-catalogue';
import { getPublicHomepage } from './public-homepage';

export interface PublicNavigationCategory {
  description: string | null;
  image: { altText: string; focalPoint: string; url: string } | null;
  name: string;
  slug: string;
}

export async function getPublicNavigationCategories(): Promise<
  PublicNavigationCategory[]
> {
  const [homepage, catalogue] = await Promise.all([
    getPublicHomepage().catch(() => null),
    listCategories('?page=1&pageSize=100').catch(() => null),
  ]);
  const selected = homepage?.categories ?? [];
  const selectedBySlug = new Map(selected.map((item) => [item.slug, item]));
  const slugs = new Set<string>();
  const result: PublicNavigationCategory[] = [];
  for (const category of selected) {
    if (slugs.has(category.slug)) continue;
    slugs.add(category.slug);
    result.push({
      description: category.description,
      image: category.image.url
        ? {
            altText: category.image.altText,
            focalPoint: category.image.focalPoint,
            url: category.image.url,
          }
        : null,
      name: category.name,
      slug: category.slug,
    });
  }
  for (const category of catalogue?.items ?? []) {
    if (slugs.has(category.slug)) continue;
    slugs.add(category.slug);
    const featured = selectedBySlug.get(category.slug);
    result.push({
      description: category.description,
      image: featured?.image.url
        ? {
            altText: featured.image.altText,
            focalPoint: featured.image.focalPoint,
            url: featured.image.url,
          }
        : null,
      name: category.name,
      slug: category.slug,
    });
  }
  return result.slice(0, 8);
}
