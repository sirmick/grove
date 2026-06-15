import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'], // unit tests only; e2e (*.spec.ts) runs via `pnpm e2e`
    passWithNoTests: true,
  },
})
