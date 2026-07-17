import { expect, test } from '@playwright/test'

function homeHeroPreloads(html: string) {
  return [
    ...html.matchAll(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bhref="\/img\/home-bg\.avif")[^>]*>/g
    ),
  ].map(([link]) => link)
}

test('首頁初始 HTML 以高優先級預載 AVIF Hero，文章頁不預載', async ({ request }) => {
  const homeResponse = await request.get('/')
  const homeHtml = await homeResponse.text()
  const [homeHeroPreload] = homeHeroPreloads(homeHtml)

  expect(homeResponse.ok()).toBe(true)
  expect(homeHeroPreloads(homeHtml)).toHaveLength(1)
  expect(homeHeroPreload).toContain('as="image"')
  expect(homeHeroPreload).toContain('type="image/avif"')
  expect(homeHeroPreload).toMatch(/fetchpriority="high"/i)

  const articleResponse = await request.get('/2026/04/26/learning-how-to-learn/')
  const articleHtml = await articleResponse.text()

  expect(articleResponse.ok()).toBe(true)
  expect(homeHeroPreloads(articleHtml)).toHaveLength(0)
})

test('預設 Hero 使用 AVIF，解碼失敗時保留藍色漸層背景', async ({ page, request }) => {
  const imageResponse = await request.get('/img/home-bg.avif')
  const heroRequests: string[] = []

  expect(imageResponse.ok()).toBe(true)
  expect(imageResponse.headers()['content-type']).toContain('image/avif')

  page.on('request', (pageRequest) => {
    if (pageRequest.url().includes('home-bg.')) heroRequests.push(pageRequest.url())
  })
  await page.route('**/img/home-bg.avif', (route) => route.abort())
  await page.goto('/')
  const backgroundImage = await page
    .locator('.intro-header-home')
    .evaluate((element) => getComputedStyle(element).backgroundImage)

  expect(backgroundImage).toContain('home-bg.avif')
  expect(backgroundImage).toContain('linear-gradient')
  expect(backgroundImage).toContain('rgb(30, 58, 138)')
  expect(backgroundImage).toContain('rgb(59, 130, 246)')
  expect(heroRequests.some((url) => url.endsWith('/img/home-bg.avif'))).toBe(true)
  expect(heroRequests.some((url) => url.endsWith('/img/home-bg.webp'))).toBe(false)
})
