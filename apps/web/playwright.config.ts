import { defineConfig } from '@playwright/test';

const viewports = [
  ['mobile-320', 320, 720],
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1024', 1024, 768],
  ['wide-1440', 1440, 900],
  ['xl-1920', 1920, 1080],
  ['ultrawide-2560', 2560, 1440],
] as const;

export default defineConfig({
  testDir: './e2e',
  testIgnore:
    process.env.MENSAH_ISOLATED_E2E === 'verified-local-test-database'
      ? []
      : [
          '**/admin-decisions.spec.ts',
          '**/quotes.spec.ts',
          '**/orders.spec.ts',
          '**/maintenance.spec.ts',
          '**/amendments-isolated.spec.ts',
          '**/homepage.spec.ts',
        ],
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    colorScheme: 'light',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: viewports.map(([name, width, height]) => ({
    name,
    use: { browserName: 'chromium', viewport: { width, height } },
  })),
});
