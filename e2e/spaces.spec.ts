import { type Page, expect, test } from '@playwright/test'

// Per-browser-tab spaces. Runs against the multi-space stack (test-spaces/{alpha,beta}), the only
// harness where the switcher exists. The point of every test here: one tab switching space must not
// drag any other tab along — they share an origin, a cookie jar and localStorage, so the binding has
// to live in the URL and travel on each request.
//
// Both pages come from the SAME browser context on purpose: that's the shared-cookie condition the
// old cookie-scoped implementation failed under.

const ONLY = (space: string) => `[data-record="notes/only-${space}"]`

/** Mark the live document so a full page reload can be detected (a reload wipes the flag). */
async function markPage(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __alive?: boolean }).__alive = true
  })
}
const stillAlive = (page: Page) =>
  page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive === true)

async function openAt(page: Page, space: string) {
  await page.goto(`/?space=${space}`)
  await expect(page.locator(ONLY(space))).toBeVisible({ timeout: 15000 })
}

test('switching space rebinds only the tab that switched — in place, no reload', async ({
  context,
}) => {
  const a = await context.newPage()
  await openAt(a, 'alpha')
  await markPage(a)

  const b = await context.newPage()
  await openAt(b, 'alpha')
  await markPage(b)

  await b.locator('.spacesel').selectOption('beta')

  // b moved: content, URL, and no reload on the way (the sentinel survived).
  await expect(b.locator(ONLY('beta'))).toBeVisible({ timeout: 15000 })
  await expect(b.locator(ONLY('alpha'))).toHaveCount(0)
  await expect(b).toHaveURL(/[?&]space=beta/)
  expect(await stillAlive(b)).toBe(true)

  // a didn't: same content, same URL, same document — b's switch never reached it.
  await expect(a.locator(ONLY('alpha'))).toBeVisible()
  await expect(a.locator(ONLY('beta'))).toHaveCount(0)
  await expect(a).toHaveURL(/[?&]space=alpha/)
  expect(await stillAlive(a)).toBe(true)

  // …and a still TALKS to alpha afterwards. b's switch wrote the shared grove_space cookie; only
  // the ?space= in a's own URL keeps its corpus/SSE/PTY pointed at alpha across a reload.
  await a.reload()
  await expect(a.locator(ONLY('alpha'))).toBeVisible({ timeout: 15000 })
  await expect(a.locator(ONLY('beta'))).toHaveCount(0)
})

test('a fresh tab opens in the last space used, and back returns to the previous one', async ({
  context,
}) => {
  const page = await context.newPage()
  await openAt(page, 'alpha')
  await page.locator('.spacesel').selectOption('beta')
  await expect(page.locator(ONLY('beta'))).toBeVisible({ timeout: 15000 })

  // The cookie is the seed for a NEW tab (nothing in its URL to go on).
  const fresh = await context.newPage()
  await fresh.goto('/')
  await expect(fresh.locator(ONLY('beta'))).toBeVisible({ timeout: 15000 })
  await expect(fresh).toHaveURL(/[?&]space=beta/)

  // The switch pushed a history entry, so Back is a switch back — still in place.
  await markPage(page)
  await page.goBack()
  await expect(page.locator(ONLY('alpha'))).toBeVisible({ timeout: 15000 })
  expect(await stillAlive(page)).toBe(true)
})

test('each space keeps its own drafts and open tabs across a switch', async ({ context }) => {
  const page = await context.newPage()
  await openAt(page, 'alpha')

  // Leave an uncommitted edit in alpha.
  await page.locator('[data-record="notes/only-alpha"]').click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' ALPHA-DRAFT')
  await expect(page.getByRole('button', { name: 'Save (1)' })).toBeVisible({ timeout: 15000 })

  // beta starts clean — alpha's draft and its open document tab don't bleed through.
  await page.locator('.spacesel').selectOption('beta')
  await expect(page.locator(ONLY('beta'))).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Save (0)' })).toBeVisible()
  await expect(page.locator('.tabbar')).not.toContainText('only-alpha')

  // Back in alpha the draft and the tab are still there.
  await page.locator('.spacesel').selectOption('alpha')
  await expect(page.getByRole('button', { name: 'Save (1)' })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.tabbar')).toContainText('only-alpha')
})

test('terminals follow the space and resume when you switch back', async ({ context }) => {
  const page = await context.newPage()
  await openAt(page, 'alpha')

  await page.locator('.pane:visible .xterm-screen').click()
  await page.keyboard.type('echo ALPHA-TERM-MARKER\n')
  await expect(page.locator('.pane:visible .xterm-rows')).toContainText('ALPHA-TERM-MARKER', {
    timeout: 15000,
  })

  // beta gets its own terminal; alpha's tab stays in the strip, dimmed and labelled with its space.
  await page.locator('.spacesel').selectOption('beta')
  await expect(page.locator(ONLY('beta'))).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.ttab.other')).toHaveCount(1)
  await expect(page.locator('.pane:visible .xterm-rows')).not.toContainText('ALPHA-TERM-MARKER')

  // Clicking alpha's terminal switches this tab back and reattaches to the still-running PTY, which
  // replays its scrollback.
  await page.locator('.ttab.other .tl').click()
  await expect(page.locator(ONLY('alpha'))).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.pane:visible .xterm-rows')).toContainText('ALPHA-TERM-MARKER', {
    timeout: 15000,
  })
})
