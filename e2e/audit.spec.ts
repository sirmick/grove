import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// Audit fixes: live fs-watch of source files, relative links/images resolving to the project (served
// via /assets), and the version badge. Single-space harness; the test runs in Node so it can write
// straight to the space dir to exercise the source watcher.
const SERVER = 'http://localhost:5279'
const SPACE = fileURLToPath(new URL('../test-space', import.meta.url))

// 1×1 png
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('version: 0.8.0 shows in the UI', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('v0.8.0')).toBeVisible({ timeout: 15000 })
})

test('fswatch: an external source edit refreshes the UI (no API call)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^notes$/ }).first()).toBeVisible({ timeout: 15000 })
  // Write a brand-new record directly to disk, bypassing /incoming entirely. Only the source
  // watcher (rebuild + respin + SSE) can make this surface in the running UI.
  writeFileSync(`${SPACE}/notes/e2e-fswatch.md`, '# E2E FSWatch Live\n\n**Tags:** x\n')
  await expect(page.getByText('E2E FSWatch Live').first()).toBeVisible({ timeout: 20000 })
})

test('links: relative image serves from /assets; wikilink + relative .md link navigate', async ({
  page,
  request,
}) => {
  // an asset + a target doc + a source doc that references both via relative paths and a wikilink
  await request.put(`${SERVER}/upload/notes/pic.png`, {
    data: PNG,
    headers: { 'content-type': 'image/png' },
  })
  await request.put(`${SERVER}/incoming/notes/e2e-target.md`, {
    data: '# E2E Target\n\n**Tags:** x\n',
    headers: { 'content-type': 'text/plain' },
  })
  await request.put(`${SERVER}/incoming/notes/e2e-src.md`, {
    data: '# E2E Src\n\n**Tags:** x\n\n![the pic](pic.png)\n\n[to target](e2e-target.md) and [[notes/e2e-target]]\n',
    headers: { 'content-type': 'text/plain' },
  })

  await page.goto('/')
  await page.locator('[data-record="notes/e2e-src"]').click()
  await expect(page.getByRole('heading', { name: 'E2E Src', level: 1 })).toBeVisible({ timeout: 15000 })
  const body = page.locator('.body')

  // image rewritten to the project-relative asset route, and it actually serves
  const img = body.locator('img')
  await expect(img).toHaveAttribute('src', '/assets/notes/pic.png')
  const asset = await request.get(`${SERVER}/assets/notes/pic.png`)
  expect(asset.status()).toBe(200)
  expect(asset.headers()['content-type']).toContain('image/png')

  // relative .md link → in-app nav
  await expect(body.locator('a.rellink')).toHaveAttribute('data-slug', 'notes/e2e-target')
  await body.locator('a.rellink').click()
  await expect(page.getByRole('heading', { name: 'E2E Target', level: 1 })).toBeVisible()

  // wikilink → in-app nav
  await page.locator('[data-record="notes/e2e-src"]').click()
  await body.locator('a.wikilink').click()
  await expect(page.getByRole('heading', { name: 'E2E Target', level: 1 })).toBeVisible()
})
