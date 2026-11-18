import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node server/test/e2e-server.js',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
