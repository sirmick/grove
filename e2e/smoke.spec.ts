import { expect, test } from '@playwright/test'

const SERVER = 'http://localhost:5279'

const head = async (request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> }) =>
  ((await (await request.get(`${SERVER}/db/meta.json`)).json()) as { headCommit: string })
    .headCommit

test('browse: tree → collection page → doc + backlinks', async ({ page }) => {
  await page.goto('/')

  for (const c of ['capitals', 'notes', 'papers', 'trades']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${c}$`) }).first()).toBeVisible()
  }

  await page
    .getByRole('button', { name: /^capitals$/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Schema' })).toBeVisible()
  await expect(page.getByText('capitals/tokyo')).toBeVisible()

  await page.getByRole('button', { name: 'Tokyo' }).first().click()
  await expect(page.getByRole('heading', { name: 'Tokyo', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Backlinks' })).toBeVisible()
})

test('edit + commit → real git commit (HEAD advances) + persists', async ({ page, request }) => {
  await page.goto('/')
  const before = await head(request)

  await page.getByRole('navigation').getByRole('button', { name: 'Welcome' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Source' }).click() // notes default to WYSIWYG; use source
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End') // append at the end, don't corrupt links mid-body
  await page.keyboard.type(' EDITED-BY-E2E')

  await page.getByRole('button', { name: /^Save \(/ }).click()
  await expect(page.getByRole('button', { name: 'Save (0)' })).toBeVisible({ timeout: 15000 })

  const corpus = (await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<
    string,
    string
  >
  expect(corpus['notes/welcome.md']).toContain('EDITED-BY-E2E')
  expect(await head(request)).not.toBe(before) // a real commit happened
})

test('wysiwyg: doc opens in rich editor by default → edits round-trip to markdown', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: 'Welcome' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  // notes is entry: editor → WYSIWYG is the default view; the rich editor is mounted.
  const wys = page.locator('.wys')
  await expect(wys).toBeVisible()
  await wys.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' WYSIWYG-E2E')

  await page.getByRole('button', { name: /^Save \(/ }).click()
  await expect(page.getByRole('button', { name: 'Save (0)' })).toBeVisible({ timeout: 15000 })

  const corpus = (await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<
    string,
    string
  >
  expect(corpus['notes/welcome.md']).toContain('WYSIWYG-E2E')
})

test('live update: server write → SSE reconcile → tree shows new node', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^notes$/ }).first()).toBeVisible()

  await request.put(`${SERVER}/incoming/notes/e2e-live.md`, {
    data: '# E2E Live\n\n**Tags:** x\n',
    headers: { 'content-type': 'text/plain' },
  })

  await expect(page.getByText('E2E Live').first()).toBeVisible({ timeout: 15000 })
})

test('dev tier: terminal renders + exec channel runs grove', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('.xterm')).toBeVisible() // xterm mounted in the bottom pane

  const res = await request.post(`${SERVER}/exec`, {
    data: { args: ['records', 'create', '--collection', 'notes', '--title', 'Termexec'] },
  })
  expect(res.ok()).toBeTruthy()
  const out = (await res.json()) as { code: number; stderr: string }
  expect(out.code, out.stderr).toBe(0)

  await expect
    .poll(
      async () =>
        ((await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<string, string>)[
          'notes/termexec.md'
        ],
      { timeout: 15000 },
    )
    .toContain('# Termexec')
  await page.reload()
  await expect(page.getByText('Termexec').first()).toBeVisible({ timeout: 20000 })
})

test('dev tier: terminal reconnect does not duplicate replay or fight tabs', async ({
  context,
  page,
}) => {
  await page.goto('/')
  const term = page.locator('.xterm')
  await expect(term).toContainText('grove terminal')

  await context.setOffline(true)
  await context.setOffline(false)
  await term.click()
  await page.keyboard.type("printf 'AFTER-RECONNECT\\n'\r")
  await expect(term).toContainText('AFTER-RECONNECT')

  const text = await term.innerText()
  expect((text.match(/grove terminal/g) ?? []).length).toBe(1)

  const page2 = await context.newPage()
  await page2.goto('/')
  await expect(page2.locator('.xterm')).toContainText('grove terminal')
  const sid1 = await page.evaluate(() => sessionStorage.getItem('grove:terminal-session:v1'))
  const sid2 = await page2.evaluate(() => sessionStorage.getItem('grove:terminal-session:v1'))
  expect(sid1).toBeTruthy()
  expect(sid2).toBeTruthy()
  expect(sid1).not.toBe(sid2)
})

test('dev tier: spaces create scaffolds a new space', async ({ request }) => {
  // isolated root in /tmp so it can't pollute the repo; verifies the CLI verb via the exec channel
  const root = `/tmp/grove-e2e-spaces-${Date.now()}`
  const res = await request.post(`${SERVER}/exec`, {
    data: { args: ['spaces', 'create', '--name', 'fresh', '--root', root] },
  })
  expect(res.ok()).toBeTruthy()
  const { code, stdout } = (await res.json()) as { code: number; stdout: string }
  expect(code).toBe(0)
  expect(stdout).toContain('fresh') // { name: "fresh", path: …, headCommit: … }
})

test('ingestion: review draft → promote to verified', async ({ page, request }) => {
  await page.goto('/')
  // simulate an ingested review draft landing in papers
  await request.put(`${SERVER}/incoming/papers/e2e-ingest.md`, {
    data: '---\n_status: review\n_source: https://example.com\n_model: claude-opus-4-8\n---\n# E2E Ingest\n\n**Authors:** Bot\n**Year:** 2026\n\nIngested summary.\n',
    headers: { 'content-type': 'text/plain' },
  })

  const node = page.getByText('E2E Ingest').first()
  await expect(node).toBeVisible({ timeout: 15000 })
  await node.click()
  await expect(page.getByText(/pending review/)).toBeVisible()

  await page.getByRole('button', { name: 'Promote' }).click()
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<string, string>)[
          'papers/e2e-ingest.md'
        ],
      { timeout: 15000 },
    )
    .not.toContain('_status: review')
})
