import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// "bin" first-class folder: a raw mirror of <space>/bin. We seed real files on disk (the test runs
// in Node) — one executable, one not — then drive the UI: green for the exec bit, code editor on
// click, edits saved back to disk with the exec bit preserved.
const SERVER = 'http://localhost:5279'
const BIN = fileURLToPath(new URL('../test-space/bin', import.meta.url))

test.beforeAll(() => {
  mkdirSync(BIN, { recursive: true })
  writeFileSync(`${BIN}/deploy.sh`, '#!/bin/bash\necho deploying\n')
  chmodSync(`${BIN}/deploy.sh`, 0o755) // executable
  writeFileSync(`${BIN}/notes.txt`, 'just notes\n')
  chmodSync(`${BIN}/notes.txt`, 0o644) // not executable
  // noise that must never surface (denylist) and a subdir that must stay collapsed until clicked
  mkdirSync(`${BIN}/__pycache__`, { recursive: true })
  writeFileSync(`${BIN}/__pycache__/junk.pyc`, 'x')
  mkdirSync(`${BIN}/scripts`, { recursive: true })
  writeFileSync(`${BIN}/scripts/inner.sh`, '#!/bin/sh\necho inner\n')
})

test('bin: lists files, tints executables green, opens + saves in the code editor', async ({
  page,
  request,
}) => {
  await page.goto('/')

  // the bin section lists both files
  const exe = page.getByRole('button', { name: 'deploy.sh' })
  const txt = page.getByRole('button', { name: 'notes.txt' })
  await expect(exe).toBeVisible({ timeout: 15000 })
  await expect(txt).toBeVisible()

  // executable bit → green class; the plain file does not get it
  await expect(exe).toHaveClass(/exec/)
  await expect(txt).not.toHaveClass(/exec/)

  // denylist: __pycache__ is never surfaced
  await expect(page.getByRole('button', { name: '__pycache__' })).toHaveCount(0)
  // directories are collapsed by default — a child only shows after its dir is clicked
  await expect(page.getByRole('button', { name: 'inner.sh' })).toHaveCount(0)
  await page.getByRole('button', { name: 'scripts' }).click()
  await expect(page.getByRole('button', { name: 'inner.sh' })).toBeVisible()

  // open the executable in the code editor — content + exec badge show
  await exe.click()
  await expect(page.locator('.cm-content')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.cm-content')).toContainText('deploying')
  await expect(page.getByText('exec', { exact: true })).toBeVisible()

  // edit + save
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('echo EDITED-BY-E2E\n')
  await page.locator('.file').getByRole('button', { name: /^Save/ }).click()

  // persisted to disk, still executable
  await expect
    .poll(
      async () => {
        const r = await request.get(`${SERVER}/fs/read?path=bin%2Fdeploy.sh`)
        return r.ok() ? ((await r.json()) as { content: string }).content : ''
      },
      { timeout: 15000 },
    )
    .toContain('EDITED-BY-E2E')
  expect(statSync(`${BIN}/deploy.sh`).mode & 0o111).not.toBe(0) // exec bit preserved
})
