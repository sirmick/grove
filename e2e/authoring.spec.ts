import { type Page, expect, test } from '@playwright/test'

// Authoring from the UI: the New menu (blank document / collection) and the discard-all escape
// hatch. Both creation paths write drafts first and only reach disk on Commit, so each test checks
// the draft count moves AND the committed corpus, not just what's on screen.
const SERVER = 'http://localhost:5279'

type Corpus = Record<string, string>
const corpus = async (request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> }) =>
  (await (await request.get(`${SERVER}/corpus.json`)).json()) as Corpus

/** Answer the next `n` window.prompt/confirm dialogs (the New menu asks for a title, then a kind). */
function answer(page: Page, replies: (string | boolean)[]) {
  let i = 0
  page.on('dialog', (d) => {
    const reply = replies[i++]
    void (reply === false ? d.dismiss() : d.accept(typeof reply === 'string' ? reply : ''))
  })
}

const newMenu = (page: Page) => page.locator('.newmenu summary')

test('New → blank document creates a draft that commits into the open collection', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.locator('[data-collection="notes"]').click() // the New menu acts on the active collection

  answer(page, ['E2E New Doc'])
  await newMenu(page).click()
  await page.getByRole('button', { name: 'Blank document' }).click()

  // It opens as a tab with an uncommitted draft — nothing on disk yet.
  await expect(page.locator('.tabbar')).toContainText('e2e-new-doc')
  await expect(page.getByRole('button', { name: 'Commit (1)' })).toBeVisible()
  expect((await corpus(request))['notes/e2e-new-doc.md']).toBeUndefined()

  await page.getByRole('button', { name: /^Commit \(/ }).click()
  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible({ timeout: 15000 })
  expect((await corpus(request))['notes/e2e-new-doc.md']).toContain('# E2E New Doc')
})

test('New → collection scaffolds schema + overview + prompt and commits them together', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.locator('[data-collection="notes"]').click() // new collections nest under the open one

  // name, then the record-vs-document kind (confirm: OK = structured records)
  answer(page, ['E2E Coll', true])
  await newMenu(page).click()
  await page.getByRole('button', { name: 'Collection…' }).click()

  // Three scaffold files, all pending as one change.
  await expect(page.getByRole('button', { name: 'Commit (3)' })).toBeVisible()
  await page.locator('.commitmenu summary').click()
  await expect(
    page.locator('.commitmenu .files li', { hasText: 'notes/e2e-coll/_grove/schema' }),
  ).toBeVisible()
  await page.locator('.commitmenu .msg').fill('e2e: scaffold a collection')
  await page.getByRole('button', { name: /^Commit$/ }).click()

  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible({ timeout: 15000 })
  const c = await corpus(request)
  expect(c['notes/e2e-coll/_grove/schema.yaml']).toContain('collection: e2e-coll')
  expect(c['notes/e2e-coll/_grove/schema.yaml']).toContain('entry: form')
  expect(c['notes/e2e-coll/_grove/overview.md']).toContain('E2e-coll')
  expect(c['notes/e2e-coll/_grove/prompt.md']).toBeDefined()

  // …and the new collection is in the tree, so it can be worked in immediately. (Clicking a
  // collection row also toggles it, so the first click above collapsed notes — click to re-expand.)
  await page.locator('[data-collection="notes"]').click()
  await expect(page.locator('[data-collection="notes/e2e-coll"]')).toBeVisible({ timeout: 15000 })
})

test('discard all drops every pending draft without touching the corpus', async ({
  page,
  request,
}) => {
  await request.put(`${SERVER}/incoming/notes/discard-a.md`, {
    data: '# Discard A\n\nbody\n',
    headers: { 'content-type': 'text/plain' },
  })
  await request.put(`${SERVER}/incoming/notes/discard-b.md`, {
    data: '# Discard B\n\nbody\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')

  for (const rec of ['notes/discard-a', 'notes/discard-b']) {
    await page.locator(`[data-record="${rec}"]`).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Source' }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' NEVER-COMMITTED')
  }
  await expect(page.getByRole('button', { name: 'Commit (2)' })).toBeVisible()

  answer(page, [true]) // "Discard all N unsaved change(s)?"
  await page.locator('.commitmenu summary').click()
  await page.getByRole('button', { name: 'Discard all' }).click()

  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible()
  const c = await corpus(request)
  expect(c['notes/discard-a.md']).not.toContain('NEVER-COMMITTED')
  expect(c['notes/discard-b.md']).not.toContain('NEVER-COMMITTED')
})
