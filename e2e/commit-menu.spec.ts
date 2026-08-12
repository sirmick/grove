import { expect, test } from '@playwright/test'

// The commit menu: pending-changes list, per-file discard, and a custom commit message.
const SERVER = 'http://localhost:5279'

const corpus = async (request: {
  get: (u: string) => Promise<{ json: () => Promise<unknown> }>
}) => (await (await request.get(`${SERVER}/corpus.json`)).json()) as Record<string, string>

const meta = async (request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> }) =>
  (await (await request.get(`${SERVER}/db/meta.json`)).json()) as {
    log: Array<{ message: string }>
  }

async function editSource(page: import('@playwright/test').Page, record: string, text: string) {
  await page.locator(`[data-record="${record}"]`).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('commit menu lists pending files and commits with a custom message', async ({
  page,
  request,
}) => {
  await request.put(`${SERVER}/incoming/notes/cm-a.md`, {
    data: '# CM A\n\nbody\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')
  await editSource(page, 'notes/cm-a', ' COMMIT-VIA-MENU')

  await page.locator('.commitmenu summary').click()
  await expect(page.locator('.commitmenu .files li', { hasText: 'notes/cm-a' })).toBeVisible()

  await page.locator('.commitmenu .msg').fill('docs: my custom subject')
  await page.getByRole('button', { name: /^Commit$/ }).click()

  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible({ timeout: 15000 })
  expect((await corpus(request))['notes/cm-a.md']).toContain('COMMIT-VIA-MENU')
  expect((await meta(request)).log[0]?.message).toBe('docs: my custom subject')
})

test('commit menu discards a single draft without committing it', async ({ page, request }) => {
  await request.put(`${SERVER}/incoming/notes/cm-b.md`, {
    data: '# CM B\n\nbody\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')
  await editSource(page, 'notes/cm-b', ' SHOULD-BE-DISCARDED')

  await expect(page.getByRole('button', { name: 'Commit (1)' })).toBeVisible()
  await page.locator('.commitmenu summary').click()
  await page.locator('.commitmenu .files li', { hasText: 'notes/cm-b' }).locator('.discard').click()

  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible()
  // The discarded edit never reached disk.
  expect((await corpus(request))['notes/cm-b.md']).not.toContain('SHOULD-BE-DISCARDED')
})
