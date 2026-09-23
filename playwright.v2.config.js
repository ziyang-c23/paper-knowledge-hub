import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e-v2',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  outputDir: 'tmp/v2-review/playwright-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tmp/v2-review/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    viewport: { width: 1440, height: 1024 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e-v2/server.mjs',
    url: 'http://127.0.0.1:4177/api/status',
    reuseExistingServer: false,
  },
});
