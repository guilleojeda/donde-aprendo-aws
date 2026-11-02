import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'creator-owner.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000,
  expect: { timeout: 7_500 },
  outputDir: 'test-results/creator-browser',
  reporter: [
    ['line'],
    ['html', {
      outputFolder: 'playwright-report/creator-browser',
      open: 'never',
    }],
  ],
  use: {
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    viewport: { width: 1365, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
