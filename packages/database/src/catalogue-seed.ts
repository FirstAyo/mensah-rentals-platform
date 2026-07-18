import type { PrismaClient } from '@prisma/client';

const CATALOGUE_SEED_LOCK = 2_026_071_813;

const categories = [
  {
    description: 'Seating equipment for events, productions, and projects.',
    name: 'Seating',
    slug: 'seating',
    sortOrder: 10,
  },
  {
    description: 'Shelter and tent equipment for temporary spaces.',
    name: 'Tents',
    slug: 'tents',
    sortOrder: 20,
  },
] as const;

const products = [
  {
    categorySlug: 'seating',
    description: 'A practical folding chair for event and project seating.',
    isFeatured: true,
    name: 'Folding Chair',
    rentalUnit: 'each',
    shortDescription: 'Versatile folding seating for events and productions.',
    slug: 'folding-chair',
    specifications: [
      { label: 'Use', value: 'Indoor or covered outdoor events' },
      { label: 'Rental unit', value: 'Each' },
    ],
  },
  {
    categorySlug: 'tents',
    description: 'A compact frame tent suitable for temporary event shelter.',
    isFeatured: true,
    name: '10x10 Frame Tent',
    rentalUnit: 'each',
    shortDescription: 'Compact frame tent for events and temporary spaces.',
    slug: '10x10-frame-tent',
    specifications: [
      { label: 'Footprint', value: '10 ft × 10 ft' },
      { label: 'Rental unit', value: 'Each' },
    ],
  },
] as const;

export async function runCatalogueSeed(prisma: PrismaClient) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('The catalogue sample seed is development-only.');
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${CATALOGUE_SEED_LOCK})`;
    let categoriesCreated = 0;
    let productsCreated = 0;

    for (const category of categories) {
      const existing = await transaction.category.findUnique({
        where: { slug: category.slug },
      });
      if (!existing) {
        await transaction.category.create({ data: category });
        categoriesCreated += 1;
      }
    }

    for (const product of products) {
      const existing = await transaction.product.findUnique({
        where: { slug: product.slug },
      });
      if (existing) continue;
      const category = await transaction.category.findUnique({
        where: { slug: product.categorySlug },
      });
      if (!category)
        throw new Error(`Seed category ${product.categorySlug} is missing.`);
      await transaction.product.create({
        data: {
          categoryId: category.id,
          description: product.description,
          isFeatured: product.isFeatured,
          name: product.name,
          rentalUnit: product.rentalUnit,
          shortDescription: product.shortDescription,
          slug: product.slug,
          specifications: {
            create: product.specifications.map((specification, sortOrder) => ({
              ...specification,
              sortOrder,
            })),
          },
        },
      });
      productsCreated += 1;
    }

    return { categoriesCreated, productsCreated };
  });
}
