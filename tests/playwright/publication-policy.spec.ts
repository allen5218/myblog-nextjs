import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const draftCanonical = '/2026/07/30/draft-gate-test/'
const draftAlias = '/blog/draft-gate-test/'
const draftTitle = 'Draft Gate Sentinel Post'

const hiddenCanonical = '/2025/08/16/catalog-test/'
const hiddenAlias = '/blog/catalog-test/'

// hidden 群集在 2025-08-16(×4)、2025-08-29、2025-09-08,其前後的公開文章。
// 「最新文章只有 previous」守不住政策 —— 最新文章附近沒有 hidden 文章,
// pager 誤用 reachable 而非 listed 的結果完全相同。
const publicAfterHiddenCluster = '/2025/09/23/claude-code-jekyll-blog-journey/'
const publicBeforeHiddenCluster = '/2021/04/30/typora-latex-mathjax/'

test('production 不供應 draft 的任何公開入口', async ({ page, request }) => {
  expect((await request.get(draftCanonical)).status()).toBe(404)
  expect((await request.get(`${draftCanonical}opengraph-image`)).status()).toBe(404)

  // Playwright 預設會跟隨 redirect。若 legacy route 仍回 308 而 canonical 才擋掉,
  // 跟隨之後同樣是 404 —— 那會讓錯誤實作綠燈。必須不跟隨並確認沒有 Location。
  const alias = await request.get(draftAlias, { maxRedirects: 0 })
  expect(alias.status()).toBe(404)
  expect(alias.headers()['location']).toBeUndefined()

  await page.goto(draftCanonical)
  expect(await page.content()).not.toContain(draftTitle)

  expect(readFileSync('public/search.json', 'utf8')).not.toContain(draftTitle)
})

test('hidden 文章仍完整可達,只是不列出', async ({ page, request }) => {
  expect((await request.get(hiddenCanonical)).status()).toBe(200)

  const og = await request.get(`${hiddenCanonical}opengraph-image`)
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toContain('image/png')

  // 正向控制:證明 legacy route 沒有被整條改成 404,也證明上一個測試的
  // 「無 Location」斷言真的有鑑別力。
  const alias = await request.get(hiddenAlias, { maxRedirects: 0 })
  expect(alias.status()).toBe(308)
  // Next 在 cold-cache(x-nextjs-cache: MISS)時會對同一個 308 送出兩個一模一樣的
  // location header,warm 之後只剩一個。這是既有的框架行為,與本次改動無關
  // (用改動前的 route 重建也會重現),兩個值完全相同所以瀏覽器導向正確。
  // 因此這裡斷言「所有 location 的值都剛好是 canonical 路徑」,而不是「只有一個 header」
  // —— 後者釘的是快取狀態,不是我們要保護的重導行為。不要改回嚴格相等。
  const locations = alias
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'location')
    .map((header) => header.value)
  expect(locations.length).toBeGreaterThan(0)
  expect([...new Set(locations)]).toEqual([hiddenCanonical])

  // metadata 的接線:只驗 200 守不住 generateMetadata()。
  await page.goto(hiddenCanonical)
  await expect(page).toHaveTitle(/catalog/i)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /catalog-test/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/)

  await expect(page.locator('.post-container > .pager li')).toHaveCount(0)
})

test('pager 跨過 hidden 群集直接連到下一篇公開文章', async ({ page }) => {
  await page.goto(publicAfterHiddenCluster)
  const previous = page.locator('.post-container > .pager .previous a')
  await expect(previous).toHaveAttribute('href', publicBeforeHiddenCluster)

  await page.goto(publicBeforeHiddenCluster)
  const next = page.locator('.post-container > .pager .next a')
  await expect(next).toHaveAttribute('href', publicAfterHiddenCluster)
})
