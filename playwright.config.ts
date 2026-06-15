import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// e2e runs the real stack (server + Vite) against an isolated copy of the demo space, on
// DEDICATED ports so a running dev instance (5179/5180) can never be hit by mistake.
const testSpace = fileURLToPath(new URL('./test-space', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5280' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5280',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      GROVE_SPACE: testSpace,
      GROVE_PORT: '5279',
      GROVE_SERVER: 'http://localhost:5279',
      VITE_PORT: '5280',
    },
  },
})
