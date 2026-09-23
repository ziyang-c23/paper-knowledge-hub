import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4175/paper-knowledge-hub/',
    viewport: { width: 1440, height: 1024 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://127.0.0.1:4175/paper-knowledge-hub/',
    reuseExistingServer: !process.env.CI,
  },
});
