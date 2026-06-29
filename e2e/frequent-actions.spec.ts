import { expect, test } from '@playwright/test'

const SERVER = 'http://localhost:5279'

// The "frequent actions" menu is the AI-maintained _grove/actions.md, surfaced on the Project page.
test('project page lists frequent actions and copies a request', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: 'Project' }).click()

  // Seeded in spaces/demo/_grove/actions.md, sorted most-asked first.
  await expect(page.getByRole('heading', { name: /Frequent actions/ })).toBeVisible()
  const addCity = page.locator('li', { hasText: 'Add a city' })
  await expect(addCity).toBeVisible()
  await expect(addCity.getByText('4×')).toBeVisible()

  // Copy flips the button label as feedback (copyText never throws, even if clipboard is denied).
  const copyBtn = addCity.getByRole('button', { name: 'Copy' })
  await copyBtn.click()
  await expect(addCity.getByRole('button', { name: /Copied/ })).toBeVisible()
})

test('AI maintaining _grove/actions.md shows up live on the Project page', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: 'Project' }).click()

  // Simulate the `ai` assistant recording a recurring request for this space.
  await request.put(`${SERVER}/incoming/_grove/actions.md`, {
    data: '# Frequent actions\n\n## Pull new cars\n**Asked:** 7×\n\nFetch newly released models and add the missing ones as `_status: review`.\n',
    headers: { 'content-type': 'text/plain' },
  })

  await expect(page.locator('li', { hasText: 'Pull new cars' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('7×')).toBeVisible()
})
