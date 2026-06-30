import { expect, test } from '@playwright/test'

// The light/dark theme is driven by <html data-theme> and flipped from the chrome toggle; the choice
// persists in localStorage. Surfaces use CSS tokens, so the body background must actually change.
test('theme toggle flips data-theme, restyles surfaces, and persists', async ({ page }) => {
  await page.goto('/')

  const html = page.locator('html')
  const toggle = page.getByRole('button', { name: /Switch to (light|dark) theme/ })
  await expect(toggle).toBeVisible()

  const before = await html.getAttribute('data-theme')
  expect(before === 'light' || before === 'dark').toBe(true)
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const bgBefore = await bodyBg()

  await toggle.click()
  const after = before === 'dark' ? 'light' : 'dark'
  await expect(html).toHaveAttribute('data-theme', after)
  expect(await bodyBg()).not.toBe(bgBefore) // tokens actually reskinned the page

  // Persists across reloads.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', after)
})
