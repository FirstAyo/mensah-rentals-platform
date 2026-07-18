import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './index';
import { runCatalogueSeed } from './catalogue-seed';
describe('catalogue development seed against PostgreSQL', () => {
  afterAll(async () => prisma.$disconnect());
  it('is idempotent and contains no inventory fields', async () => {
    const first = await runCatalogueSeed(prisma);
    const counts = {
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
    };
    const second = await runCatalogueSeed(prisma);
    expect(second).toEqual({ categoriesCreated: 0, productsCreated: 0 });
    expect({
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
    }).toEqual(counts);
    expect(JSON.stringify(first)).not.toMatch(/quantity|availability|price/i);
  });
  it('enforces unique slugs and public-active parent semantics', async () => {
    const category = await prisma.category.findUnique({
      where: { slug: 'seating' },
    });
    expect(category).toBeTruthy();
    await expect(
      prisma.category.create({ data: { name: 'Duplicate', slug: 'seating' } }),
    ).rejects.toBeTruthy();
    const publicProducts = await prisma.product.findMany({
      where: { isActive: true, category: { isActive: true } },
    });
    expect(publicProducts.length).toBeGreaterThan(0);
  });
});
