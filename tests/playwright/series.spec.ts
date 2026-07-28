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
