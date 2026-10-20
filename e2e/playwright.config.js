import { defineConfig } from '@playwright/test'

// E2E_BASE: the stack under test. Default is the local copy (compose.yml); the same suite runs
// against production with a throwaway account by pointing E2E_BASE at it.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    actionTimeout: 10_000,
    baseURL: process.env.E2E_BASE || 'http://localhost:8099',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    screenshot: 'only-on-failure',
  },
})
