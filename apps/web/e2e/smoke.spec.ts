import { expect, test } from '@playwright/test';

test('@smoke web, admin, API, and database are ready', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await expect(page).toHaveTitle(/Mensah Rentals/i);
  const admin = await request.get('http://localhost:3001/login');
  expect(admin.status()).toBe(200);
  const api = await request.get('http://localhost:4000/health');
  expect(api.status()).toBe(200);
  const database = await request.get('http://localhost:4000/health/database');
  expect(database.status()).toBe(200);
  expect(await database.json()).toMatchObject({
    database: 'connected',
    status: 'ok',
  });
});
