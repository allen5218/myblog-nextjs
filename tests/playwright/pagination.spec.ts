import { expect, test } from '@playwright/test'

// 原站(jekyll-paginate)的語意:index.html 就是第 1 頁,Older Posts 直接到 /page2/。
// 移植到 Next.js 時多長出一個 /blog 當作第二個「第 1 頁」,於是首頁的 Older Posts
// 前進了零頁 —— 使用者看到的「要按兩次」就是這個。這些測試把原站語意釘死。

const newestPostPath = '/2026/04/26/learning-how-to-learn/'
const oldestPostPath = '/2021/04/30/typora-latex-mathjax/'
const siteUrl = 'https://blog.allenspace.de'

test('首頁的 Older Posts 一次點擊就抵達第 2 頁', async ({ page }) => {
  await page.goto('/')

  const olderPosts = page.getByRole('link', { name: /Older Posts/ })
  await expect(olderPosts).toHaveAttribute('href', '/page2/')

  await expect(page.locator(`a[href="${newestPostPath}"]`)).not.toHaveCount(0)
  await expect(page.locator(`a[href="${oldestPostPath}"]`)).toHaveCount(0)

  await olderPosts.click()
  await page.waitForURL('**/page2/')

  // 第 2 頁必須是不同的文章,否則就是原本那個「看起來沒反應」的 bug
  await expect(page.locator(`a[href="${oldestPostPath}"]`)).not.toHaveCount(0)
  await expect(page.locator(`a[href="${newestPostPath}"]`)).toHaveCount(0)
})

test('第 2 頁的 Newer Posts 回到首頁而非 /blog/', async ({ page }) => {
  await page.goto('/page2/')

  await expect(page.getByRole('link', { name: /Newer Posts/ })).toHaveAttribute('href', '/')
  // 最後一頁沒有 Older
  await expect(page.getByRole('link', { name: /Older Posts/ })).toHaveCount(0)
})

test('/page3/ 不存在', async ({ request }) => {
  const response = await request.get('/page3/', { maxRedirects: 0 })
  expect(response.status()).toBe(404)
})

test('舊的 /blog 分頁網址永久導向新結構', async ({ request }) => {
  const cases: [string, string][] = [
    ['/blog/', '/'],
    ['/blog/page/1/', '/'],
    ['/blog/page/2/', '/page2/'],
  ]

  for (const [from, to] of cases) {
    const response = await request.get(from, { maxRedirects: 0 })
    expect(response.status(), `${from} 應該永久導向`).toBe(308)
    expect(response.headers()['location'], `${from} -> ${to}`).toBe(to)
  }
})

test('標籤頁不再有 /page/1/ 重複分身', async ({ request }) => {
  const pageOne = await request.get('/tags/ai/page/1/', { maxRedirects: 0 })
  expect(pageOne.status()).toBe(308)
  expect(pageOne.headers()['location']).toBe('/tags/ai/')

  // ai 只有 2 篇,總頁數 1,所以第 2 頁不存在
  const pageTwo = await request.get('/tags/ai/page/2/', { maxRedirects: 0 })
  expect(pageTwo.status()).toBe(404)
})

test('sitemap 收錄樞紐頁,且不含任何會導向的網址', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const xml = await sitemap.text()

  expect(xml).toContain(`<loc>${siteUrl}/</loc>`)
  expect(xml).toContain(`<loc>${siteUrl}/archive/</loc>`)
  expect(xml).not.toContain(`<loc>${siteUrl}/blog/</loc>`)
})

test('sitemap 的靜態路由不使用每次建置都變動的時間戳', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml')
  const xml = await sitemap.text()

  const dayOf = (timestamp: string) => timestamp.split('T')[0]

  const homeLastmod = xml.match(
    new RegExp(`<loc>${siteUrl}/</loc>\\s*<lastmod>([^<]+)</lastmod>`)
  )?.[1]
  expect(homeLastmod).toBeDefined()

  const postLastmods = [
    ...xml.matchAll(
      new RegExp(`<loc>${siteUrl}/20\\d\\d/[^<]+</loc>\\s*<lastmod>([^<]+)</lastmod>`, 'g')
    ),
  ].map((match) => dayOf(match[1]))
  expect(postLastmods.length).toBeGreaterThan(0)

  // 首頁的 lastmod 必須反映最新文章的日期。用「今天」等於每次部署都對爬蟲喊狼來了。
  expect(dayOf(homeLastmod!)).toBe(postLastmods.sort().at(-1))
})
