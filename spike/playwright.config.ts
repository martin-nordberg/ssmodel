import { defineConfig, devices } from '@playwright/test'

// Runs the P0 spike measurements (`bun run spike`). Separate from the app's e2e suite and not run in CI.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spike.ts',
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx --bun vite --config spike/vite.config.ts',
    cwd: '..',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
