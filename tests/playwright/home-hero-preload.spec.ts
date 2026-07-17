import { expect, test } from '@playwright/test'

function homeHeroPreloads(html: string) {
  return [
    ...html.matchAll(
      /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bhref="\/img\/home-bg\.webp")[^>]*>/g
    ),
  ].map(([link]) => link)
}

test('首頁初始 HTML 只預載預設 Hero WebP 背景圖，文章頁不預載', async ({ request }) => {
  const homeResponse = await request.get('/')
  const homeHtml = await homeResponse.text()
  const [homeHeroPreload] = homeHeroPreloads(homeHtml)

  expect(homeResponse.ok()).toBe(true)
  expect(homeHeroPreloads(homeHtml)).toHaveLength(1)
  expect(homeHeroPreload).toContain('as="image"')
  expect(homeHeroPreload).toContain('type="image/webp"')

  const articleResponse = await request.get('/2026/04/26/learning-how-to-learn/')
  const articleHtml = await articleResponse.text()

  expect(articleResponse.ok()).toBe(true)
  expect(homeHeroPreloads(articleHtml)).toHaveLength(0)
})
