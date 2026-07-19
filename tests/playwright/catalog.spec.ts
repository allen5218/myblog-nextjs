import { expect, test } from '@playwright/test'

const postPath = '/2026/07/13/vaultwarden-cloudflare-tunnel/'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(postPath)
  await page.mouse.wheel(0, 800)
})

test('catalog 預設只顯示二級標題,可展開單一章節的子標題', async ({ page }) => {
  const catalog = page.getByRole('complementary', { name: 'Post catalog' })

  await expect(catalog.locator('li:visible')).toHaveCount(9)
  await expect(catalog.getByRole('link', { name: '不推薦 nginx 反向代理' })).toHaveCount(0)

  await catalog.getByRole('button', { name: '展開「為什麼選 Cloudflare Tunnel」的子目錄' }).click()

  await expect(catalog.locator('li:visible')).toHaveCount(12)
  await expect(catalog.getByRole('link', { name: '不推薦 nginx 反向代理' })).toBeVisible()
  await expect(catalog.getByRole('link', { name: '不推薦 Tailscale Funnel' })).toBeVisible()
  await expect(catalog.getByRole('link', { name: 'Cloudflare Tunnel 的優點' })).toBeVisible()
})

test('展開章節時會同時顯示三級與四級標題', async ({ page }) => {
  await page.goto('/2025/08/16/catalog-test/')
  await page.mouse.wheel(0, 800)

  const catalog = page.getByRole('complementary', { name: 'Post catalog' })
  await expect(catalog.getByRole('link', { name: '二級標題測試' })).toHaveCount(0)
  await expect(catalog.getByRole('link', { name: '三級標題測試' })).toHaveCount(0)

  await catalog.getByRole('button', { name: '展開「一級標題測試」的子目錄' }).click()

  await expect(catalog.getByRole('link', { name: '二級標題測試' })).toBeVisible()
  await expect(catalog.getByRole('link', { name: '三級標題測試' })).toBeVisible()
})

test('窄螢幕顯示可折疊的文章目錄並提供足夠的觸控間距', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(postPath)

  const tableOfContents = page.getByRole('navigation', { name: 'Table of contents' })
  const sideCatalog = page.getByRole('complementary', { name: 'Post catalog' })

  await expect(tableOfContents).toBeVisible()
  await expect(sideCatalog).toBeHidden()
  await expect(tableOfContents.locator('details')).not.toHaveAttribute('open', '')

  await tableOfContents.getByText('TABLE OF CONTENTS', { exact: true }).click()
  await expect(
    tableOfContents.getByRole('link', { name: '為什麼選 Cloudflare Tunnel' })
  ).toBeVisible()
  await expect(tableOfContents.getByRole('link', { name: '不推薦 nginx 反向代理' })).toBeVisible()

  const touchTargetHeights = await tableOfContents
    .locator('summary, a:visible')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
  expect(Math.min(...touchTargetHeights)).toBeGreaterThanOrEqual(44)

  await tableOfContents.getByRole('link', { name: '為什麼選 Cloudflare Tunnel' }).click()
  await page.waitForTimeout(1800)

  const heading = page.getByRole('heading', { name: '為什麼選 Cloudflare Tunnel' })
  expect(await heading.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(
    80
  )
})

test('向上或向下點擊 catalog 都保留導覽列下方的標題與正確 active 項目', async ({ page }) => {
  const catalog = page.getByRole('complementary', { name: 'Post catalog' })
  const dailyHeading = page.getByRole('heading', { name: '日常使用：讓子域名分開比對' })
  const whyHeading = page.getByRole('heading', { name: '為什麼選 Cloudflare Tunnel' })

  await catalog.getByRole('link', { name: '日常使用：讓子域名分開比對' }).click()
  await page.waitForTimeout(1800)
  expect(
    await dailyHeading.evaluate((element) => Math.round(element.getBoundingClientRect().top))
  ).toBe(80)
  await expect(catalog.locator('li.active a')).toHaveText('日常使用：讓子域名分開比對')

  await catalog.getByRole('link', { name: '為什麼選 Cloudflare Tunnel' }).click()
  await page.waitForTimeout(1800)
  expect(
    await whyHeading.evaluate((element) => Math.round(element.getBoundingClientRect().top))
  ).toBe(80)
  await expect(catalog.locator('li.active a')).toHaveText('為什麼選 Cloudflare Tunnel')
})
