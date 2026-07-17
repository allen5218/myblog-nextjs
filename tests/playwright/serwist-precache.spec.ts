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

test('未瀏覽過的頁面在離線時仍顯示與線上一致的後備頁(樣式 + hydration)', async ({
  browser,
}) => {
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
  // 等 activate 的離線 chunk 暖快取完成才能斷網。刻意不綁定內部 cache 名:
  // 直接驗證「離線頁引用的每個 JS chunk 都存在於某個 runtime cache」。
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const html = await (await fetch('/offline/')).text()
          const urls = [
            ...new Set(
              Array.from(html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g), (match) => match[0])
            ),
          ]
          const results = await Promise.all(urls.map((url) => caches.match(url)))
          return urls.length > 0 && results.every(Boolean)
        }),
      { timeout: 15_000 }
    )
    .toBe(true)

  // 清掉瀏覽器 HTTP cache(保留 Cache Storage),確保接下來的資產只能來自
  // service worker 的 precache / 暖快取,而不是靠首頁瀏覽留下的 disk cache 假通過。
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.clearBrowserCache')

  await context.setOffline(true)
  await page.goto('/never-visited-before/')
  await expect(page.getByRole('heading', { name: '離線' })).toBeVisible()

  // 與線上一致性:CSS 真的套用(Tailwind preflight 歸零 body margin;無樣式時
  // 瀏覽器預設 8px)、Chiron core 字型與 hero 背景圖都來自快取,且頁面完成
  // hydration(ThemeSwitch SSR 是空白 svg,mounted 後才有圖示子節點)。
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.theme-switch-icon svg')?.childElementCount ?? 0
      )
    )
    .toBeGreaterThan(0)
  const styled = await page.evaluate(async () => {
    await document.fonts.ready
    const hero = document.querySelector<HTMLElement>('.intro-header')
    const heroImage = await fetch('/img/404-bg.webp')
    return {
      bodyMargin: getComputedStyle(document.body).margin,
      chironLoaded: document.fonts.check("16px 'Chiron Sung HK'", '離線'),
      heroBackground: hero ? getComputedStyle(hero).backgroundImage : '',
      heroImageOk: heroImage.ok,
    }
  })
  expect(styled.bodyMargin).toBe('0px')
  expect(styled.chironLoaded).toBe(true)
  expect(styled.heroBackground).toContain('404-bg.webp')
  expect(styled.heroImageOk).toBe(true)

  await context.close()
})
