import { expect, test } from '@playwright/test'

// Search: the chrome search box → MiniSearch index → results tab → opening a hit. The index is
// built client-side from the corpus and cached per (space, build), so a record added after the
// first search must still be findable — that's the invalidation path this covers.
const SERVER = 'http://localhost:5279'

const seed = (
  request: { put: (u: string, o: unknown) => Promise<unknown> },
  slug: string,
  body: string,
) =>
  request.put(`${SERVER}/incoming/${slug}.md`, {
    data: body,
    headers: { 'content-type': 'text/plain' },
  })

test('typing in the search box finds a record and opens it', async ({ page, request }) => {
  await seed(request, 'notes/search-one', '# Search One\n\nA note about zarquon plumbing.\n')
  await page.goto('/')
  await expect(page.locator('[data-record="notes/search-one"]')).toBeVisible({ timeout: 15000 })

  await page.locator('.searchbox input').fill('zarquon')

  // The Search tab opens with the hit; clicking it opens the record.
  const hit = page.locator('.records li', { hasText: 'notes/search-one' })
  await expect(hit).toBeVisible({ timeout: 15000 })
  await hit.getByRole('button', { name: 'Search One' }).click()
  await expect(page.getByRole('heading', { name: 'Search One', level: 1 })).toBeVisible()
})

test('a record added after the first search is still findable (index invalidation)', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.locator('.searchbox input').fill('bufflewump') // builds + caches the index
  await expect(page.getByText('No results.')).toBeVisible({ timeout: 15000 })

  // A respin must drop the cached index, not serve the pre-existing one forever.
  await seed(request, 'notes/search-two', '# Search Two\n\nThe bufflewump procedure.\n')
  await expect(page.locator('[data-record="notes/search-two"]')).toBeVisible({ timeout: 20000 })

  await page.locator('.searchbox input').fill('bufflewum')
  await expect(page.locator('.records li', { hasText: 'notes/search-two' })).toBeVisible({
    timeout: 15000,
  })
})

test('search results always match the query in the box', async ({ page, request }) => {
  await seed(request, 'notes/search-alpha', '# Search Alpha\n\nkryptonium alpha only.\n')
  await seed(request, 'notes/search-beta', '# Search Beta\n\nbismuthium beta only.\n')
  await page.goto('/')
  await expect(page.locator('[data-record="notes/search-beta"]')).toBeVisible({ timeout: 20000 })

  // Two searches in quick succession: the index build makes the replies race, and the older one
  // must never overwrite the newer query's hits.
  const box = page.locator('.searchbox input')
  await box.fill('kryptonium')
  await box.fill('bismuthium')

  await expect(page.locator('.records li', { hasText: 'notes/search-beta' })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.locator('.records li', { hasText: 'notes/search-alpha' })).toHaveCount(0)
})
