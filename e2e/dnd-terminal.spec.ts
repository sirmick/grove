import { expect, test } from '@playwright/test'

// Drag-drop re-file + OS upload + multi-tab terminals + per-space persistence. Runs against the
// single-space e2e harness (GROVE_SPACE=test-space), so cross-space switching isn't exercised here;
// reload stands in for it where persistence is what matters. All records created here use e2e-*
// names distinct from smoke.spec's so the shared space isn't disturbed.
const SERVER = 'http://localhost:5279'

type Corpus = Record<string, string>
const corpus = async (request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> }) =>
  (await (await request.get(`${SERVER}/corpus.json`)).json()) as Corpus

const seed = (request: { put: (u: string, o: unknown) => Promise<unknown> }, rel: string) =>
  request.put(`${SERVER}/incoming/${rel}`, {
    data: `# ${rel}\n\n**Tags:** x\n`,
    headers: { 'content-type': 'text/plain' },
  })

test('re-file: POST /move relocates a record between collections', async ({ request }) => {
  await seed(request, 'notes/e2e-move.md')
  const res = await request.post(`${SERVER}/move`, {
    data: { items: [{ type: 'record', id: 'notes/e2e-move' }], dest: 'papers' },
  })
  expect(res.ok()).toBeTruthy()
  const c = await corpus(request)
  expect(c['papers/e2e-move.md']).toBeDefined()
  expect(c['notes/e2e-move.md']).toBeUndefined()
})

test('re-file: /move rejects an illegal destination', async ({ request }) => {
  await seed(request, 'notes/e2e-bad.md')
  // dropping a record onto a non-existent collection is refused (no file is touched)
  const res = await request.post(`${SERVER}/move`, {
    data: { items: [{ type: 'record', id: 'notes/e2e-bad' }], dest: 'does-not-exist' },
  })
  expect(res.status()).toBe(400)
  expect((await corpus(request))['notes/e2e-bad.md']).toBeDefined()
})

test('upload: /upload stores markdown + a binary asset, rejects unsupported types', async ({
  request,
}) => {
  const md = await request.put(`${SERVER}/upload/notes/e2e-up.md`, {
    data: '# Uploaded\n\n**Tags:** y\n',
    headers: { 'content-type': 'text/markdown' },
  })
  expect(md.status()).toBe(204)

  // a 1×1 png — an asset; binary-safe write, committed but not part of the markdown corpus
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const asset = await request.put(`${SERVER}/upload/notes/e2e-pic.png`, {
    data: png,
    headers: { 'content-type': 'image/png' },
  })
  expect(asset.status()).toBe(204)

  const bad = await request.put(`${SERVER}/upload/notes/e2e-bad.exe`, {
    data: 'x',
    headers: { 'content-type': 'application/octet-stream' },
  })
  expect(bad.status()).toBe(400)

  expect((await corpus(request))['notes/e2e-up.md']).toContain('Uploaded')
})

test('re-file: drag a record row onto a collection in the UI', async ({ page, request }) => {
  await seed(request, 'notes/e2e-dnd.md')
  await page.goto('/')
  const src = page.locator('[data-record="notes/e2e-dnd"]')
  const tgt = page.locator('[data-collection="papers"]')
  await expect(src).toBeVisible({ timeout: 15000 })

  // Drive HTML5 drag-drop with one shared DataTransfer across dragstart→dragover→drop (Playwright's
  // dragTo doesn't carry native dnd payloads). The handle pattern wires event.dataTransfer reliably;
  // our handlers set/read the x-grove-tree MIME on it.
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await src.dispatchEvent('dragstart', { dataTransfer: dt })
  await tgt.dispatchEvent('dragover', { dataTransfer: dt })
  await tgt.dispatchEvent('drop', { dataTransfer: dt })

  await expect
    .poll(async () => (await corpus(request))['papers/e2e-dnd.md'], { timeout: 15000 })
    .toBeDefined()
  expect((await corpus(request))['notes/e2e-dnd.md']).toBeUndefined()
})

test('upload: drop an OS file onto a collection in the UI', async ({ page, request }) => {
  await page.goto('/')
  const tgt = page.locator('[data-collection="papers"]')
  await expect(tgt).toBeVisible({ timeout: 15000 })

  // A DataTransfer carrying a File, mimicking an OS drag from the desktop.
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer()
    d.items.add(new File(['# Dropped\n\n**Tags:** z\n'], 'e2e-drop.md', { type: 'text/markdown' }))
    return d
  })
  await tgt.dispatchEvent('dragover', { dataTransfer: dt })
  await tgt.dispatchEvent('drop', { dataTransfer: dt })

  await expect
    .poll(async () => (await corpus(request))['papers/e2e-drop.md'], { timeout: 15000 })
    .toContain('Dropped')
})

test('terminal: multi-tab open/switch keeps scrollback; reload replays it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.xterm')).toHaveCount(1)

  // tab 1: leave a marker
  await page.locator('.pane:visible .xterm-screen').click()
  await page.keyboard.type('echo TAB-ONE-MARKER\n')
  await expect(page.locator('.pane').nth(0).locator('.xterm-rows')).toContainText('TAB-ONE-MARKER', {
    timeout: 15000,
  })

  // open a second terminal → both panes mounted (the inactive one hidden, not destroyed)
  await page.getByTitle('New terminal (Ctrl+Shift+T)').click()
  await expect(page.locator('.xterm')).toHaveCount(2)
  await page.locator('.pane:visible .xterm-screen').click()
  await page.keyboard.type('echo TAB-TWO-MARKER\n')
  await expect(page.locator('.pane').nth(1).locator('.xterm-rows')).toContainText('TAB-TWO-MARKER', {
    timeout: 15000,
  })

  // switch back to tab 1 — its scrollback survived the switch (display:none, not unmount)
  await page.getByRole('tab').first().click()
  await expect(page.locator('.pane').nth(0).locator('.xterm-rows')).toContainText('TAB-ONE-MARKER')

  // reload: the server keys the PTY by (space, sid) and replays scrollback on reconnect
  await page.reload()
  await expect(page.locator('.xterm')).toHaveCount(2)
  await expect(page.locator('.pane').nth(0).locator('.xterm-rows')).toContainText('TAB-ONE-MARKER', {
    timeout: 15000,
  })
})

test('persistence: open tab + tree expansion survive a reload', async ({ page }) => {
  await page.goto('/')

  // open a document tab
  await page.locator('[data-record="notes/welcome"]').click()
  await expect(page.locator('.tabbar')).toContainText('welcome')

  // collapse a top-level collection (open by default) and confirm its child disappears
  await page.locator('[data-collection="capitals"]').click()
  await expect(page.locator('[data-record="capitals/tokyo"]')).toHaveCount(0)

  await page.reload()

  // tab restored, collection still collapsed
  await expect(page.locator('.tabbar')).toContainText('welcome', { timeout: 15000 })
  await expect(page.locator('[data-collection="capitals"]')).toBeVisible()
  await expect(page.locator('[data-record="capitals/tokyo"]')).toHaveCount(0)
})
