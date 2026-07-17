import { expect, test } from '@playwright/test'

test('About 語言切換保留同一個 Hero DOM 節點', async ({ page }) => {
  await page.goto('/about/')

  const hero = page.locator('.intro-header')
  await expect(hero).toHaveCount(1)
  await hero.evaluate((element) => {
    ;(
      window as typeof window & {
        __aboutHeroBeforeLocaleChange?: Element
      }
    ).__aboutHeroBeforeLocaleChange = element
  })

  await page.getByRole('link', { name: 'English' }).click()
  await page.waitForURL('**/en/about/')

  await expect(page.locator('.intro-header')).toHaveCount(1)
  expect(
    await page.locator('.intro-header').evaluate(
      (element) =>
        element ===
        (
          window as typeof window & {
            __aboutHeroBeforeLocaleChange?: Element
          }
        ).__aboutHeroBeforeLocaleChange
    )
  ).toBe(true)
})
