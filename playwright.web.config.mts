import { defineConfig, devices } from '@playwright/test';

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const firefoxRunnerUnsupported =
  process.platform === 'win32' && nodeMajor >= 24 && !process.env.CI;

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The media and multi-client suites share browser/audio resources. Running
  // them sequentially is both faster on the Windows runner and avoids false
  // timeouts caused by two hosted sessions competing for those resources.
  workers: 1,
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
      retries: 1,
      use: { ...devices['Desktop Firefox'] },
    },
  ].filter(({ name }) => !(firefoxRunnerUnsupported && name === 'firefox')),
});
