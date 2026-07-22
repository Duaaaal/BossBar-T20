import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/electron',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report/electron' }],
  ],
  outputDir: 'test-results/electron',
});
