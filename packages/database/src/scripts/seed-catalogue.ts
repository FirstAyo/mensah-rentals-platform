import { prisma } from '../index';
import { runCatalogueSeed } from '../catalogue-seed';

async function main() {
  const result = await runCatalogueSeed(prisma);
  process.stdout.write(
    `Catalogue seed complete: ${result.categoriesCreated} categories and ${result.productsCreated} products created.\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Catalogue seed failed.'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
