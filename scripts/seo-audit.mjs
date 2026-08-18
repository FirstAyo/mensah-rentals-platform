import { loadOperatorEnvironment } from './database-operator-tooling.mjs';

const productionOrigin = 'https://mensahrentals.com';
const environment = loadOperatorEnvironment();
if (!environment.DATABASE_URL)
  throw new Error(
    'DATABASE_URL is required for the active catalogue SEO audit.',
  );
process.env.DATABASE_URL = environment.DATABASE_URL;

const { prisma } = await import('../packages/database/dist/index.js');

function normalize(value) {
  return value.trim().toLocaleLowerCase('en-CA');
}

function audit(entries) {
  const issues = [];
  const canonicals = new Set();
  const titles = new Map();
  const descriptions = new Map();
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry.canonical);
    } catch {
      issues.push(`Malformed canonical: ${entry.canonical}`);
    }
    if (!entry.title.trim()) issues.push(`Missing title: ${entry.canonical}`);
    if (!entry.description.trim())
      issues.push(`Missing description: ${entry.canonical}`);
    if (url) {
      if (url.origin !== productionOrigin)
        issues.push(`Wrong canonical origin: ${entry.canonical}`);
      if (url.search || url.hash)
        issues.push(`Canonical has query or fragment: ${entry.canonical}`);
      if (canonicals.has(url.href))
        issues.push(`Duplicate canonical: ${entry.canonical}`);
      canonicals.add(url.href);
    }
    const title = normalize(entry.title);
    const description = normalize(entry.description);
    if (titles.has(title))
      issues.push(
        `Duplicate title: ${titles.get(title)} and ${entry.canonical}`,
      );
    else titles.set(title, entry.canonical);
    if (descriptions.has(description))
      issues.push(
        `Duplicate description: ${descriptions.get(description)} and ${entry.canonical}`,
      );
    else descriptions.set(description, entry.canonical);
    if (/localhost|127\.0\.0\.1/i.test(JSON.stringify(entry)))
      issues.push(`Localhost leakage: ${entry.canonical}`);
  }
  return issues;
}

try {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { description: true, name: true, slug: true },
    }),
    prisma.product.findMany({
      where: {
        category: { deletedAt: null, isActive: true },
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        category: { select: { name: true, slug: true } },
        name: true,
        shortDescription: true,
        slug: true,
      },
    }),
  ]);
  const entries = [
    {
      canonical: `${productionOrigin}/`,
      description:
        'Browse equipment for events, productions, and projects, then submit a rental request for a custom quote from Mensah Rentals.',
      title: 'Mensah Rentals | Equipment Rental Requests',
    },
    {
      canonical: `${productionOrigin}/rentals`,
      description:
        'Browse equipment available to request from Mensah Rentals for events, productions, and projects.',
      title: 'Equipment Rentals | Mensah Rentals',
    },
    {
      canonical: `${productionOrigin}/privacy`,
      description:
        'How Mensah Rentals handles information on its website, including private rental-request workflows.',
      title: 'Privacy policy | Mensah Rentals',
    },
    {
      canonical: `${productionOrigin}/terms`,
      description:
        'Website terms for the Mensah Rentals rental-request platform and third-party content.',
      title: 'Terms of use | Mensah Rentals',
    },
    ...categories.map((category) => ({
      canonical: `${productionOrigin}/rentals/${category.slug}`,
      description:
        category.description ??
        `Browse ${category.name.toLowerCase()} equipment available to request from Mensah Rentals.`,
      title: `${category.name} Rentals | Mensah Rentals`,
    })),
    ...products.map((product) => ({
      canonical: `${productionOrigin}/rentals/${product.category.slug}/${product.slug}`,
      description: `Explore ${product.name} in our ${product.category.name} rental catalogue. ${product.shortDescription}`,
      title: `${product.name} Rental – ${product.category.name} | Mensah Rentals`,
    })),
  ];
  const issues = audit(entries);
  if (issues.length) {
    for (const issue of issues) console.error(`FAIL ${issue}`);
    throw new Error(`SEO audit found ${issues.length} issue(s).`);
  }
  console.log(
    `SEO audit passed for ${entries.length} public pages (${categories.length} active categories, ${products.length} active products).`,
  );
} finally {
  await prisma.$disconnect();
}
