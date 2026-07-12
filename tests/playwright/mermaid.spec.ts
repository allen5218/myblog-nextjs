import { expect, test } from '@playwright/test'

// 隱藏文章可用直接 URL 路由到(只是不列在清單),含多種圖種,適合當夾具。
const mermaidPath = '/2025/08/29/mermaid-v10-test/'

test('mermaid 圖表隨客戶端主題切換而切換(深色→淺色)', async ({ page }) => {
  await page.goto(mermaidPath)

  const figure = page.locator('.mermaid-figure').first()
  await expect(figure).toBeVisible()

  const light = figure.locator('.mermaid-light')
  const dark = figure.locator('.mermaid-dark')

  // 本站預設深色(siteMetadata.theme = 'dark'):初始應顯示深色 SVG。
  await expect(dark).toBeVisible()
  await expect(light).toBeHidden()

  // 透過 ThemeSwitch 切成 Light。
  // 注意:選單項底層雖是 <button>,但 HeadlessUI 的 MenuItem 賦予的可及性角色是
  // menuitem(非 button)——用 getByRole('button', { name: 'Light' }) 會找不到,
  // 曾在此踩過雷(30s timeout),見 page snapshot 印證後改用 menuitem。
  await page.getByRole('button', { name: 'Theme switcher' }).click()
  await page.getByRole('menuitem', { name: 'Light' }).click()

  // 切換後應即時改顯示淺色 SVG,不需重載。
  await expect(light).toBeVisible()
  await expect(dark).toBeHidden()
})

test('寬圖在手機寬度下可水平捲動,不被壓縮', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(mermaidPath)

  // 找第一個「圖比容器寬」的 figure(甘特圖/序列圖通常較寬)。
  const overflowing = await page
    .locator('.mermaid-figure')
    .evaluateAll((figures) => figures.some((f) => f.scrollWidth > f.clientWidth + 1))
  expect(overflowing).toBe(true)
})
