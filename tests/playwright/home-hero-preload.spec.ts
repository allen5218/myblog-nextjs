import { expect, test } from '@playwright/test'

const homeHeroPreload = 'link[rel="preload"][href="/img/home-bg.webp"]'

test('首頁只預載預設 Hero WebP 背景圖，文章頁不預載', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator(`head > ${homeHeroPreload}`)).toHaveCount(1)
  await expect(page.locator(`head > ${homeHeroPreload}`)).toHaveAttribute('as', 'image')
  await expect(page.locator(`head > ${homeHeroPreload}`)).toHaveAttribute('type', 'image/webp')

  await page.goto('/2026/04/26/learning-how-to-learn/')

  await expect(page.locator(`head > ${homeHeroPreload}`)).toHaveCount(0)
})
