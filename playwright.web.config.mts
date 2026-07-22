import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report/web' }],
  ],
  outputDir: 'test-results/web',
  snapshotPathTemplate: '{testDir}/../snapshots/{projectName}/{arg}{ext}',
  use: {
    viewport: { width: 1280, height: 720 },
    locale: 'pt-BR',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Full Chrome for Testing downloaded and versioned by Playwright.
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
