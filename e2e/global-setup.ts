import { cpSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Fresh isolated copies of spaces/demo (minus derived db/) for each e2e run:
//   test-space/           — the single-space harness (GROVE_SPACE) every spec but spaces.spec uses
//   test-spaces/{alpha,beta} — a two-space root for spaces.spec, which needs a real space switcher
// alpha and beta each get one record the other doesn't, so a tab's bound space is visible on screen.
export default function globalSetup() {
  const demo = fileURLToPath(new URL('../spaces/demo', import.meta.url))
  const filter = (src: string) => !/[/\\](db|\.git)([/\\]|$)/.test(src)

  const testSpace = fileURLToPath(new URL('../test-space', import.meta.url))
  rmSync(testSpace, { recursive: true, force: true })
  cpSync(demo, testSpace, { recursive: true, filter })

  const root = fileURLToPath(new URL('../test-spaces', import.meta.url))
  rmSync(root, { recursive: true, force: true })
  for (const name of ['alpha', 'beta']) {
    const dir = `${root}/${name}`
    cpSync(demo, dir, { recursive: true, filter })
    writeFileSync(
      `${dir}/notes/only-${name}.md`,
      `# Only ${name}\n\nA record that exists in the ${name} space and nowhere else.\n`,
    )
  }
}
