import { expect, test } from '@playwright/test'

// Regression tests for the review-fixes batch: WYSIWYG round-trip fidelity, rendered-HTML
// sanitization, the concurrent-edit conflict, and the retryable Commit-after-error state.
const SERVER = 'http://localhost:5279'

const corpus = async (request: {
  get: (u: string) => Promise<{ json: () => Promise<unknown> }>
}) => (await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<string, string>

test('wysiwyg preserves wikilinks (as links) and does not collapse field lines', async ({
  page,
  request,
}) => {
  // Seed a record with a wikilink and several house-format field lines.
  await request.put(`${SERVER}/incoming/notes/roundtrip.md`, {
    data: '# Roundtrip\n\n**Alpha:** one\n**Beta:** two\n**Gamma:** three\n\nSee [[notes/welcome]].\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')
  await page.locator('[data-record="notes/roundtrip"]').click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  const wys = page.locator('.wys')
  await expect(wys).toBeVisible()
  await wys.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' EDITED')

  await page.getByRole('button', { name: /^Commit \(/ }).click()
  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible({ timeout: 15000 })

  const md = (await corpus(request))['notes/roundtrip.md'] ?? ''
  // Field lines survive extraction (were previously merged into one, dropping Beta/Gamma).
  expect(md).toContain('**Alpha:** one')
  expect(md).toContain('**Beta:** two')
  expect(md).toContain('**Gamma:** three')
  // The wikilink is not corrupted into `\[\[...\]\]`; it round-trips to a valid link that still
  // resolves to the target slug.
  expect(md).not.toContain('\\[\\[')
  expect(md).toMatch(/\[welcome\]\(.*welcome\.md\)|\[\[notes\/welcome\]\]/)
  expect(md).toContain('EDITED')
})

test('rendered doc HTML is sanitized (no onerror / script execution)', async ({
  page,
  request,
}) => {
  await request.put(`${SERVER}/incoming/notes/xss.md`, {
    data: '# XSS\n\nSafe **bold**.\n\n<img src=x onerror="window.__xss=1">\n\n<script>window.__xss=1</script>\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')
  await page.locator('[data-record="notes/xss"]').click()
  await expect(page.getByRole('heading', { name: 'XSS', level: 1 })).toBeVisible()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  // The onerror attribute is stripped from any surviving img.
  expect(await page.locator('.body img[onerror]').count()).toBe(0)
})

test('concurrent edit is detected as a conflict instead of silently clobbering', async ({
  page,
  request,
}) => {
  await request.put(`${SERVER}/incoming/notes/conflict.md`, {
    data: '# Conflict\n\noriginal body\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')
  await page.locator('[data-record="notes/conflict"]').click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' UI-EDIT')

  // An external write advances HEAD on the same file while the draft is held.
  await request.put(`${SERVER}/incoming/notes/conflict.md`, {
    data: '# Conflict\n\noriginal body EXTERNAL-EDIT\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.waitForTimeout(2500) // let SSE reconcile land

  await page.getByRole('button', { name: /^Commit \(/ }).click()
  // The commit is rejected; the draft is kept (Commit still shows a pending count) and Commit stays
  // clickable so it can be retried.
  await expect(page.locator('.syncst.err')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /^Commit \(1\)/ })).toBeEnabled()

  // The external edit was not clobbered, and Commit stays enabled so it can be retried (B2).
  expect((await corpus(request))['notes/conflict.md']).toContain('EXTERNAL-EDIT')
})
