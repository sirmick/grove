import { expect, test } from '@playwright/test'

// The link map is now a 2D canvas force-graph (Graph2D), not the old three.js Graph3D. Node
// positions are physics-driven so we can't click a specific node deterministically; this asserts
// the view mounts, the 2D canvas is present + sized, and the surrounding summary/preview render.
test('links: the 2D graph canvas renders in the link map', async ({ page }) => {
  await page.goto('/')

  // Project → "Open the link map →"
  await page.getByRole('button', { name: 'Project' }).first().click()
  await page.getByRole('button', { name: /Open the link map/ }).click()

  await expect(page.getByRole('heading', { name: 'Links', level: 1 })).toBeVisible({
    timeout: 15000,
  })

  // the 2D canvas graph is present and has real dimensions
  const canvas = page.locator('.graph2d canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(100)
  expect(box?.height ?? 0).toBeGreaterThan(100)

  // summary chips render (record/link counts)
  await expect(page.locator('.summary')).toContainText('records')
})
