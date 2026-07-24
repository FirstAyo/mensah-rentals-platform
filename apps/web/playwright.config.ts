import { defineConfig } from '@playwright/test';

const viewports = [
  ['mobile-320', 320, 720],
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1024', 1024, 768],
  ['wide-1440', 1440, 900],
  ['xl-1920', 1920, 1080],
] as const;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
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
  webServer:
    process.env.PLAYWRIGHT_EXTERNAL_SERVER === 'true'
      ? undefined
      : {
          command: 'pnpm --dir ../.. dev',
          reuseExistingServer: true,
          timeout: 180_000,
          url: 'http://localhost:3000/rentals',
        },
});
