import { expect, test } from '@playwright/test'

const validAiPath = '/2025/10/12/ai-learning-community/'
const invalidAiPath = '/2025/10/13/ai-learning-community/'
const hiddenPath = '/2025/08/16/catalog-test/'
const openWebUiPath = '/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/'
const mathPath = '/2021/04/30/typora-latex-mathjax/'
const validAiUrl = `https://blog.allenspace.de${validAiPath}`
const validAiUrlWithoutSlash = validAiUrl.replace(/\/$/, '')

test('listed surfaces use legacy URLs and keep hidden posts out', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveTitle("Allen's Blog")
  await expect(page.getByRole('link', { name: /課程啟動 - AI 跨領域學習社群/ })).toHaveAttribute(
    'href',
    validAiPath
  )
  await expect(page.getByText('FEATURED TAGS')).toBeVisible()
  await expect(page.getByText('ABOUT ME')).toBeVisible()
  await expect(page.getByText('FRIENDS')).toBeVisible()
  await expect(page.getByText('這篇短文是')).toBeVisible()
  await expect(page.getByText('catalog-test')).toHaveCount(0)

  await page.goto('/archive/')
  await expect(page.getByRole('link', { name: /課程啟動 - AI 跨領域學習社群/ })).toHaveAttribute(
    'href',
    validAiPath
  )
  await expect(page.getByText('Catalog Test')).toHaveCount(0)

  const archiveHtml = await request.get('/archive/')
  expect(archiveHtml.ok()).toBe(true)
  const archiveHtmlText = await archiveHtml.text()
  expect(archiveHtmlText).toContain('mini-post-list')
  expect(archiveHtmlText).toContain('課程啟動 - AI 跨領域學習社群')

  const searchIndex = await request.get('/search.json')
  expect(searchIndex.ok()).toBe(true)
  const searchText = await searchIndex.text()
  expect(searchText).toContain('2025/10/12/ai-learning-community')
  expect(searchText).not.toContain('catalog-test')

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  const sitemapText = await sitemap.text()
  expect(sitemapText).toContain(`<loc>${validAiUrl}</loc>`)
  expect(sitemapText).not.toContain(`<loc>${validAiUrlWithoutSlash}</loc>`)
  expect(sitemapText).not.toContain('<loc>https://blog.allenspace.de/projects/</loc>')
  expect(sitemapText).toContain('<loc>https://blog.allenspace.de/about/</loc>')
  expect(sitemapText).toContain('<loc>https://blog.allenspace.de/en/about/</loc>')

  const feed = await request.get('/feed.xml')
  expect(feed.ok()).toBe(true)
  const feedText = await feed.text()
  expect(feedText).toContain(`<guid>${validAiUrl}</guid>`)
  expect(feedText).toContain(`<link>${validAiUrl}</link>`)
  expect(feedText).not.toContain(`<guid>${validAiUrlWithoutSlash}</guid>`)
  expect(feedText).not.toContain(`<link>${validAiUrlWithoutSlash}</link>`)

  const hidden = await request.get(hiddenPath)
  expect(hidden.status()).toBe(200)

  const invalid = await request.get(invalidAiPath)
  expect(invalid.status()).toBe(404)

  const projects = await request.get('/projects/')
  expect(projects.status()).toBe(404)
})

test('starter KBar search opens with cyan active result and legacy navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Search').click()
  await page.keyboard.type('AI')

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const activeResult = [...document.querySelectorAll('div')].find(
          (element) => getComputedStyle(element).backgroundColor === 'rgb(77, 184, 209)'
        )
        return activeResult?.textContent?.trim() || ''
      })
    )
    .toContain('課程啟動 - AI 跨領域學習社群')
  await expect(page.locator('.hux-search-overlay')).toHaveCount(0)
  await expect(page.getByText('Catalog Test')).toHaveCount(0)

  await page.keyboard.press('Enter')
  await page.waitForURL(`**${validAiPath}`)
  expect(page.url()).toContain(validAiPath)
})

test('KaTeX renders math without MathJax', async ({ page }) => {
  await page.goto(mathPath)
  await expect(page.locator('.katex')).not.toHaveCount(0)
  await expect(page.locator('script[src*="mathjax" i]')).toHaveCount(0)
})

test('about page uses new i18n routes without changing legacy blog URLs', async ({ page }) => {
  await page.goto('/about/')
  await expect(page.locator('.site-heading h1')).toHaveText('About')
  await expect(page.locator('article[lang="zh-TW"]')).toContainText('Hey，我是與倫')
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/en/about/')

  await page.getByRole('link', { name: 'English' }).click()
  await page.waitForURL('**/en/about/')
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
  await expect(page.locator('article[lang="en"]')).toContainText("Hey, I'm Allen")
  await expect(page.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/about/')

  await expect(page.locator('.navbar-brand')).toHaveAttribute('href', '/')

  await page.goto('/about/?lang=en')
  await page.waitForURL('**/en/about/')
  expect(page.url()).not.toContain('lang=')

  await page.goto('/about/?lang=zh')
  await page.waitForURL('**/about/')
  expect(page.url()).not.toContain('lang=')

  await page.goto('/about/?lang=zh-TW')
  await page.waitForURL('**/about/')
  expect(page.url()).not.toContain('lang=')
})

test('Hux visual shell keeps archive and post hero parity contracts', async ({ page }) => {
  await page.goto('/archive/')
  await expect
    .poll(() => page.locator('.intro-header').evaluate((el) => el.getBoundingClientRect().height))
    .toBe(228)
  await expect(page.locator('.site-heading h1')).toHaveText('Archive')
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe('rgb(45, 45, 45)')

  await page.goto(mathPath)
  await expect(page.locator('.post-heading .tags + h1')).toHaveText(
    '轉載-Typora下使用LaTex公式，Jekyll使用Mathjax顯示公式'
  )
  await expect(page.locator('.post-heading .meta')).toContainText([
    'Updated on August 13, 2025',
    'Posted by elmagnifico on April 30, 2021',
  ])
})

test('post enhancers render responsive media and client Medium Zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(validAiPath)
  await expect
    .poll(() =>
      page.locator('.intro-header-keynote').evaluate((el) => el.getBoundingClientRect().height)
    )
    .toBe(815)

  await page.goto(openWebUiPath)

  const video = page.locator('.aspect-video iframe[src*="youtube-nocookie.com"]').first()
  await expect(video).toHaveClass(/h-full/)
  await expect(video).toHaveClass(/w-full/)

  const image = page.locator('.post-container img').first()
  await expect(image).toHaveClass(/medium-zoom-image/)
  await image.scrollIntoViewIfNeeded()
  await image.click({ force: true })
  await expect(page.locator('.medium-zoom-image--opened')).toHaveCount(1)
  await expect(page.locator('.medium-zoom-overlay')).toHaveCount(1)

  await page.goto(validAiPath)
  const table = page.locator('.table-responsive > table.table')
  await expect(table).toHaveCount(1)
})
