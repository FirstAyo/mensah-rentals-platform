const endpoints = [
  ['customer website', 'http://localhost:3000/rentals'],
  ['admin login', 'http://localhost:3001/login'],
  ['API health', 'http://localhost:4000/health'],
  ['database health', 'http://localhost:4000/health/database'],
] as const;

async function waitFor(
  client: APIRequestContext,
  name: string,
  url: string,
): Promise<APIResponse> {
  const deadline = Date.now() + 60_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const response = await client.get(url, { timeout: 5_000 });
      lastStatus = response.status();
      if (response.ok()) return response;
    } catch {
      lastStatus = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `${name} was not ready at ${url} (last status ${lastStatus}).`,
  );
}

export default async function globalSetup() {
  const client = await request.newContext();
  try {
    for (const [name, url] of endpoints) await waitFor(client, name, url);
    const products = await waitFor(
      client,
      'public catalogue seed',
      'http://localhost:4000/public/products?pageSize=1',
    );
    const body: unknown = await products.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('items' in body) ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    )
      throw new Error(
        'Playwright requires at least one seeded active product. Run pnpm catalogue:seed.',
      );
  } finally {
    await client.dispose();
  }
}
import {
  request,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
