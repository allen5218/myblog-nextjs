import { expect, test } from '@playwright/test'

test('service worker 只預快取離線後備頁與其呈現依賴', async ({ request }) => {
  const response = await request.get('/serwist/sw.js')
  expect(response.ok()).toBe(true)

  const source = await response.text()
  expect(source).toContain('url:"/offline/"')
  // 後備頁的呈現依賴必須在 precache 裡:全站 CSS、Chiron core 字型、hero 背景圖。
  expect(source).toMatch(/\/_next\/static\/[^"]+\.css/)
  expect(source).toMatch(/\/static\/fonts\/chiron\/core\.[0-9a-f]+\.woff2/)
  expect(source).toContain('/img/404-bg.webp')
  // 其餘資產維持按需快取,不得回到全站 eager precache。
  expect(source).not.toContain('/static/images/')
  expect(source).not.toContain('/static/fonts/ChironSungHK-OG-')
  expect(source).not.toMatch(/\/static\/fonts\/chiron\/supplement-/)
  expect(source).not.toMatch(/\/_next\/static\/[^"]+\.js"/)
})

test('未瀏覽過的頁面在離線時仍顯示與線上一致樣式的後備頁', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()

  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  })

  await context.setOffline(true)
  await page.goto('/never-visited-before/')
  await expect(page.getByRole('heading', { name: '離線' })).toBeVisible()

  // 樣式一致性:CSS 必須真的套用(Tailwind preflight 會歸零 body margin;
  // 無樣式時瀏覽器預設是 8px)、Chiron core 字型與 hero 背景圖必須能從
  // precache 取得,不能讓離線後備頁看起來與線上不同。
  const styled = await page.evaluate(async () => {
    await document.fonts.ready
    const heroImage = await fetch('/img/404-bg.webp')
    return {
      bodyMargin: getComputedStyle(document.body).margin,
      chironLoaded: document.fonts.check("16px 'Chiron Sung HK'", '離線'),
      heroImageOk: heroImage.ok,
    }
  })
  expect(styled.bodyMargin).toBe('0px')
  expect(styled.chironLoaded).toBe(true)
  expect(styled.heroImageOk).toBe(true)

  await context.close()
})
