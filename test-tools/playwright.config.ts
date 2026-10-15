import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'final.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]], timeout: 60000,
});
