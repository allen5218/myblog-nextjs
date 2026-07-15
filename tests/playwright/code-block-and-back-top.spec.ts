import { expect, test } from '@playwright/test'

// 這篇文章的程式碼區塊夠多、夠有代表性(pre、行內 code、JSX tag token 都有)。
const postPath = '/2021/04/30/typora-latex-mathjax/'

test('code block 回退成 typography 預設深色底,行內 code 不再是自訂桃紅', async ({ page }) => {
  await page.goto(postPath)

  const pre = page.locator('.post-container .prose pre').first()
  await expect(pre).toBeVisible()
  const preBg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor)
  // 舊的自訂淺灰底是 rgb(240, 240, 240);回退後應該是深色(typography 的
  // --tw-prose-pre-bg / --tw-prose-invert-pre-bg),不會再是那個淺灰值。
  expect(preBg).not.toBe('rgb(240, 240, 240)')

  const inlineCode = page.locator('.post-container .prose :not(pre) > code').first()
  await expect(inlineCode).toBeVisible()
  const inlineBg = await inlineCode.evaluate((el) => getComputedStyle(el).backgroundColor)
  // 舊的自訂桃紅底是 rgb(249, 242, 244)
  expect(inlineBg).not.toBe('rgb(249, 242, 244)')
})

test('手機版 code block 仍然滿版出血', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(postPath)

  const pre = page.locator('.post-container .prose pre').first()
  const box = await pre.boundingBox()
  expect(box).not.toBeNull()
  // 出血:pre 寬度應該貼齊(或超出)390px 的視窗寬度,而不是被文章內距限制在更窄的欄寬。
  expect(box!.width).toBeGreaterThanOrEqual(389)
})

test('返回頂部按鈕是方角,桌面/手機位置比照舊站', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(postPath)

  const backTop = page.getByRole('button', { name: 'Back to top' })
  await expect(backTop).toHaveClass(/\bhux-elevator-control\b/)
  await expect(backTop).not.toHaveClass(/\bback-top(?:-visible)?\b/)
  const radius = await backTop.evaluate((el) => getComputedStyle(el).borderRadius)
  expect(radius).toBe('0px')

  const right = await backTop.evaluate((el) => parseFloat(getComputedStyle(el).right))
  // 桌面版 right: 4% of 1440px = 57.6px(容許次像素捨入誤差)
  expect(right).toBeCloseTo(57.6, 1)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileRight = await backTop.evaluate((el) => getComputedStyle(el).right)
  expect(mobileRight).toBe('20px')
})

test('返回頂部按鈕 hover 配色:淺色 #0085a1', async ({ page }) => {
  // 站方預設主題是 dark(data/siteMetadata.ts),要測淺色得先寫入 next-themes 的
  // localStorage 偏好,搶在任何頁面腳本執行前生效。
  await page.addInitScript(() => window.localStorage.setItem('theme', 'light'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(postPath)

  const backTop = page.getByRole('button', { name: 'Back to top' })
  // 按鈕預設 opacity:0 + pointer-events:none,要先捲過 250px 觸發顯示才能真正 hover 到它
  await page.mouse.wheel(0, 400)
  await expect(backTop).toHaveClass(/hux-elevator-control-visible/)
  await backTop.hover()
  await expect
    .poll(async () => backTop.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(0, 133, 161)') // #0085a1
})

test('返回頂部按鈕 hover 配色:深色 #66c7e0', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(postPath)

  const backTop = page.getByRole('button', { name: 'Back to top' })
  await page.mouse.wheel(0, 400)
  await expect(backTop).toHaveClass(/hux-elevator-control-visible/)
  await backTop.hover()
  await expect
    .poll(async () => backTop.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(102, 199, 224)') // #66c7e0
})
