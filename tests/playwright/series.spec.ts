import { expect, test } from '@playwright/test'

const seriesName = 'AI 自維護的知識庫'
const seriesPath = '/series/ai-自維護的知識庫/'
const encodedSeriesPath = encodeURI(seriesPath)
const articleTitle = '讓 OpenWiki 接手 AGENTS.md：守則檔不再無止盡膨脹'

function relativeLuminance(color: string) {
  const channels = color
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number)
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`)
  return channels
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left
  )
  return (lighter + 0.05) / (darker + 0.05)
}

async function setTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page
    .locator('html')
    .evaluate((element, dark) => element.classList.toggle('dark', dark), theme === 'dark')
}

async function colorsFor(
  foreground: import('@playwright/test').Locator,
  background: import('@playwright/test').Locator
) {
  return {
    foreground: await foreground.evaluate((element) => getComputedStyle(element).color),
    background: await background.evaluate((element) => getComputedStyle(element).backgroundColor),
  }
}

async function focusWithKeyboard(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator
) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let attempts = 0; attempts < 200; attempts += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => document.activeElement === element)) return
  }
  throw new Error('Target did not receive keyboard focus')
}

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
  await expect(headingSeries).toHaveText(`Part of the ${seriesName} series`)
  await expect(headingSeries.getByRole('link', { name: seriesName })).toHaveAttribute(
    'href',
    seriesPath
  )
  const headingOrder = await page
    .locator('.post-heading')
    .evaluate((heading) =>
      [...heading.children].map((child) =>
        child.classList.contains('meta')
          ? 'meta'
          : child.classList.contains('series-meta')
            ? 'series-meta'
            : child.className || child.tagName
      )
    )
  expect(headingOrder.indexOf('H1')).toBeLessThan(headingOrder.indexOf('series-meta'))
  expect(headingOrder.lastIndexOf('meta')).toBe(headingOrder.indexOf('series-meta') - 1)
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1200, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const heroTypography = await heading.evaluate((element) => {
      const postedElement = element.querySelector('.meta')!
      const seriesElement = element.querySelector('.series-meta')!
      const posted = getComputedStyle(postedElement)
      const series = getComputedStyle(seriesElement)
      const postedBounds = postedElement.getBoundingClientRect()
      const seriesBounds = seriesElement.getBoundingClientRect()
      return {
        posted: {
          fontSize: posted.fontSize,
          fontStyle: posted.fontStyle,
        },
        series: {
          fontSize: series.fontSize,
          fontStyle: series.fontStyle,
        },
        metadataGap: seriesBounds.top - postedBounds.bottom,
      }
    })
    expect(heroTypography.series).toEqual(heroTypography.posted)
    expect(heroTypography.series.fontStyle).toBe('italic')
    expect(Math.abs(heroTypography.metadataGap)).toBeLessThanOrEqual(0.5)
  }

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

test('new Series secondary labels meet WCAG AA in light and dark themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    await page.goto('/series/')
    if (theme === 'dark') {
      await page.locator('html').evaluate((element) => element.classList.add('dark'))
    } else {
      await page.locator('html').evaluate((element) => element.classList.remove('dark'))
    }

    for (const locator of [
      page.locator('.series-post-count'),
      page.locator('.series-part-label'),
    ]) {
      if ((await locator.count()) === 0) {
        await page.goto(encodedSeriesPath)
      }
      const colors = await locator.first().evaluate((element) => {
        const style = getComputedStyle(element)
        const background = getComputedStyle(document.body)
        return { foreground: style.color, background: background.backgroundColor }
      })
      expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
    }

    await page.goto('/2026/07/25/openwiki-tame-agents-md/')
    const bottomColors = await page
      .locator('.post-series-link-bottom > span')
      .evaluate((element) => {
        const style = getComputedStyle(element)
        const parentStyle = getComputedStyle(element.parentElement!)
        return { foreground: style.color, background: parentStyle.backgroundColor }
      })
    expect(contrastRatio(bottomColors.foreground, bottomColors.background)).toBeGreaterThanOrEqual(
      4.5
    )
  }
})

test('Series interactive states remain visible and meet WCAG AA in light and dark themes', async ({
  page,
}) => {
  for (const theme of ['light', 'dark'] as const) {
    const checks = [
      {
        path: '/series/',
        link: '.series-index-link',
        background: 'body',
      },
      {
        path: encodedSeriesPath,
        link: '.series-post-list .post-preview > a',
        background: 'body',
      },
      {
        path: '/2026/07/25/openwiki-tame-agents-md/',
        link: '.post-series-link-bottom a',
        background: '.post-series-link-bottom',
      },
    ]

    for (const check of checks) {
      await page.goto(check.path)
      await setTheme(page, theme)
      const link = page.locator(check.link)
      const background = page.locator(check.background)
      const resting = await link.evaluate((element) => getComputedStyle(element).color)

      await link.hover()
      const hover = await colorsFor(link, background)
      expect(contrastRatio(hover.foreground, hover.background)).toBeGreaterThanOrEqual(4.5)
      expect(hover.foreground).not.toBe(resting)

      await page.mouse.move(0, 0)
      await focusWithKeyboard(page, link)
      const focus = await colorsFor(link, background)
      expect(contrastRatio(focus.foreground, focus.background)).toBeGreaterThanOrEqual(4.5)
      expect(focus.foreground).not.toBe(resting)
    }
  }
})

test('dark mode keeps Hero Series metadata translucent white over its image', async ({ page }) => {
  await page.goto('/2026/07/25/openwiki-tame-agents-md/')
  await setTheme(page, 'dark')

  const heroColor = await page
    .locator('.intro-header-post .series-meta')
    .evaluate((element) => getComputedStyle(element).color)
  expect(heroColor).toBe('rgba(255, 255, 255, 0.85)')
})

test('desktop primary navigation keeps the exact Series order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  await expect(page.locator('.navbar-links > a')).toHaveText(['Home', 'About', 'Series', 'Archive'])
})
