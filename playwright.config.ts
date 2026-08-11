import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// e2e runs the real stack (server + Vite) against isolated copies of the demo space, on DEDICATED
// ports so a running dev instance (5179/5180) can never be hit by mistake. Two stacks:
//   single (5279/5280) — GROVE_SPACE, one space, what every spec but spaces.spec exercises
//   multi  (5281/5282) — a two-space root, so the space switcher exists and can be driven
const testSpace = fileURLToPath(new URL('./test-space', import.meta.url))
const spacesRoot = fileURLToPath(new URL('./test-spaces', import.meta.url))

const MULTI_SPEC = /spaces\.spec\.ts/

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'single', testIgnore: MULTI_SPEC, use: { baseURL: 'http://localhost:5280' } },
    { name: 'multi', testMatch: MULTI_SPEC, use: { baseURL: 'http://localhost:5282' } },
  ],
  webServer: [
    {
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
    {
      command: 'pnpm dev',
      url: 'http://localhost:5282',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        GROVE_SPACES_ROOTS: spacesRoot,
        GROVE_DEFAULT_SPACE: 'alpha',
        GROVE_PORT: '5281',
        GROVE_SERVER: 'http://localhost:5281',
        VITE_PORT: '5282',
      },
    },
  ],
})
