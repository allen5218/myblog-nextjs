import { expect, test } from '@playwright/test'

const seriesName = 'AI 自維護的知識庫'
const seriesPath = '/series/ai-自維護的知識庫/'
const encodedSeriesPath = encodeURI(seriesPath)
const articleTitle = '讓 OpenWiki 接手 AGENTS.md：守則檔不再無止盡膨脹'

test('Series index links to the statically generated collection', async ({ page }) => {
  await page.goto('/series/')
  await expect(page.locator('.site-heading h1')).toHaveText('Series')
  await expect(page.getByRole('link', { name: seriesName })).toHaveAttribute('href', seriesPath)
  await expect(page.getByText('1 post', { exact: true })).toBeVisible()
})

test('Series detail lists posts in reading order and unknown series is 404', async ({
  page,
  request,
}) => {
  await page.goto(encodedSeriesPath)
  await expect(page.locator('.site-heading h1')).toHaveText(seriesName)
  await expect(page.getByText('Part 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: articleTitle })).toHaveAttribute(
    'href',
    '/2026/07/25/openwiki-tame-agents-md/'
  )
  expect((await request.get('/series/not-a-series/')).status()).toBe(404)
})

test('sitemap contains the Series index and concrete collection URL', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  expect(xml).toContain('<loc>https://blog.allenspace.de/series/</loc>')
  expect(xml).toContain(
    `<loc>https://blog.allenspace.de/series/${encodeURI('ai-自維護的知識庫')}/</loc>`
  )
})

test('series posts link to their collection above and below the article', async ({ page }) => {
  await page.goto('/2026/07/25/openwiki-tame-agents-md/')

  const heading = page.locator('.post-heading')
  const headingSeries = heading.locator('.series-meta')
  await expect(headingSeries.getByText('Series:', { exact: true })).toBeVisible()
  await expect(headingSeries.getByRole('link', { name: seriesName })).toHaveAttribute(
    'href',
    seriesPath
  )
  const headingOrder = await page.locator('.post-heading').evaluate((heading) =>
    [...heading.children].map((child) =>
      child.classList.contains('meta') ? 'meta' : child.className || child.tagName
    )
  )
  expect(headingOrder.indexOf('H1')).toBeLessThan(headingOrder.indexOf('series-meta'))
  expect(headingOrder.lastIndexOf('meta')).toBe(headingOrder.indexOf('series-meta') - 1)

  const postContainer = page.locator('.post-container')
  const bottomSeries = postContainer.locator('.post-series-link')
  await expect(bottomSeries.getByText('Series:', { exact: true })).toBeVisible()
  await expect(bottomSeries.getByRole('link', { name: seriesName })).toHaveAttribute(
    'href',
    seriesPath
  )
  expect(
    await postContainer.evaluate((element) => {
      const prose = element.querySelector('.prose')
      const series = element.querySelector('.post-series-link')
      const pager = element.querySelector('.pager')
      return prose?.nextElementSibling === series && series?.nextElementSibling === pager
    })
  ).toBe(true)
})

test('posts without a series omit both article-level collection links', async ({ page }) => {
  await page.goto('/2026/07/14/kamiina-botan-anime-review/')

  await expect(page.locator('.post-heading .series-meta')).toHaveCount(0)
  await expect(page.locator('.post-container .post-series-link')).toHaveCount(0)
})

test('desktop primary navigation keeps the exact Series order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  await expect(page.locator('.navbar-links > a')).toHaveText([
    'Home',
    'About',
    'Series',
    'Archive',
  ])
})
