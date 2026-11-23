import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  // Each page runs its own engine worker pool; more parallel pages starve the CPU.
  workers: 2,
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      // The built app, as users get it.
      name: 'chromium',
      testDir: './test/e2e',
      testMatch: '**/*.e2e.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:4173' },
    },
    {
      // Browser-only store code (SQLite WASM, OPFS, Web Crypto) run in a worker by test/browser/harness.
      name: 'browser',
      testDir: './test/browser',
      testMatch: '**/*.browser.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5198' },
    },
  ],
  webServer: [
    {
      command: 'bun run build && bun run preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'bunx --bun vite --config test/browser/vite.config.ts',
      url: 'http://localhost:5198',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
