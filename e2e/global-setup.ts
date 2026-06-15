import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Fresh isolated copy of spaces/demo (minus derived db/) for each e2e run.
export default function globalSetup() {
  const demo = fileURLToPath(new URL('../spaces/demo', import.meta.url))
  const testSpace = fileURLToPath(new URL('../test-space', import.meta.url))
  rmSync(testSpace, { recursive: true, force: true })
  cpSync(demo, testSpace, {
    recursive: true,
    filter: (src) => !/[/\\](db|\.git)([/\\]|$)/.test(src),
  })
}
