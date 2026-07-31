import { expect, test } from '@playwright/test'
import { contrastRatio, parseColor } from '../helpers/color'
import { focusWithKeyboard } from '../helpers/focus'

const seriesName = 'AI 自維護的知識庫'
const seriesPath = '/series/ai-自維護的知識庫/'
const encodedSeriesPath = encodeURI(seriesPath)
const articleTitle = '讓 OpenWiki 接手 AGENTS.md：守則檔不再無止盡膨脹'

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
      const seriesLinkElement = element.querySelector('.series-meta a')!
      const postedBounds = postedElement.getBoundingClientRect()
      const seriesBounds = seriesElement.getBoundingClientRect()
      const typography = (target: Element) => {
        const style = getComputedStyle(target)
        return {
          color: style.color,
          fontSize: style.fontSize,
          fontStyle: style.fontStyle,
          fontWeight: style.fontWeight,
        }
      }
      return {
        posted: typography(postedElement),
        series: typography(seriesElement),
        seriesLink: typography(seriesLinkElement),
        seriesLinkDecoration: getComputedStyle(seriesLinkElement).textDecorationLine,
        metadataGap: seriesBounds.top - postedBounds.bottom,
      }
    })
    expect(heroTypography.series).toEqual(heroTypography.posted)
    // 連結只能靠底線跟句子其餘部分區分,顏色與字重都要跟 Posted by 一致。
    expect(heroTypography.seriesLink).toEqual(heroTypography.posted)
    expect(heroTypography.seriesLinkDecoration).toBe('underline')
    expect(heroTypography.series.fontStyle).toBe('italic')
    expect(Math.abs(heroTypography.metadataGap)).toBeLessThanOrEqual(0.5)
  }

  // 靜止狀態刻意與周圍文字同色,hover 的變色是這個連結唯一的動態回饋。這個 fixture 的
  // hero 是深色照片,所以 hover 色必須兩個主題都相同。(headerStyle: text 的文章不適用
  // —— 那裡的 hero 就是頁面底色,會隨主題翻轉。)少了專屬的 hover 規則就會遞補成
  // .post-series-link-top a:hover 的 --series-interactive —— 那個值會跟著主題走,
  // 淺色主題下是深青色壓在深色照片上。只驗「顏色有變」抓不到這種遞補。
  const heroLink = heading.locator('.series-meta a')
  const heroHoverByTheme: string[] = []
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    const resting = await heroLink.evaluate((element) => getComputedStyle(element).color)
    await heroLink.hover()
    const hovered = await heroLink.evaluate((element) => getComputedStyle(element).color)
    expect(hovered).not.toBe(resting)
    heroHoverByTheme.push(hovered)
    await page.mouse.move(0, 0)
  }
  expect(heroHoverByTheme[0]).toBe(heroHoverByTheme[1])
  await setTheme(page, 'light')

  const postContainer = page.locator('.post-container')
  const bottomSeries = postContainer.locator('.post-series-link')
  await expect(bottomSeries.getByText('Series:', { exact: true })).toBeVisible()
  await expect(bottomSeries.getByRole('link', { name: seriesName })).toHaveAttribute(
    'href',
    seriesPath
  )
  // Hero 的排版對齊只能透過 .intro-header-post .series-meta 覆蓋層達成,
  // 文章內的 series 連結必須保留自己的強調色與字重。
  const bottomLinkStyle = await bottomSeries.evaluate((element) => {
    const link = element.querySelector('a')!
    return {
      color: getComputedStyle(link).color,
      surroundingColor: getComputedStyle(element).color,
      fontWeight: getComputedStyle(link).fontWeight,
    }
  })
  expect(bottomLinkStyle.fontWeight).toBe('700')
  expect(bottomLinkStyle.color).not.toBe(bottomLinkStyle.surroundingColor)
  expect(
    await postContainer.evaluate((element) => {
      const prose = element.querySelector('.prose')
      const series = element.querySelector('.post-series-link')
      const pager = element.querySelector('.pager')
      return prose?.nextElementSibling === series && series?.nextElementSibling === pager
    })
  ).toBe(true)
})

test('image hero 的 series 連結 focus 色在兩個主題必須相同', async ({ page }) => {
  const measure = async (theme: 'light' | 'dark') => {
    // goto 先、setTheme 後 —— 這是本檔既有的順序,反過來的話 class 會被導航沖掉。
    await page.goto('/2026/07/25/openwiki-tame-agents-md/')
    await setTheme(page, theme)
    const link = page.locator('.intro-header-post .series-meta a').first()
    // 真的鍵盤 focus,與 text harness 同一個 helper。程式化 focus 在規則收緊成
    // :focus-visible 時不會觸發,測試會靜默失去鑑別力。
    await focusWithKeyboard(page, link)
    return link.evaluate((el) => getComputedStyle(el).color)
  }

  expect(await measure('light')).toBe(await measure('dark'))
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
      expect(
        contrastRatio(parseColor(colors.foreground), parseColor(colors.background))
      ).toBeGreaterThanOrEqual(4.5)
    }

    await page.goto('/2026/07/25/openwiki-tame-agents-md/')
    const bottomColors = await page
      .locator('.post-series-link-bottom > span')
      .evaluate((element) => {
        const style = getComputedStyle(element)
        const parentStyle = getComputedStyle(element.parentElement!)
        return { foreground: style.color, background: parentStyle.backgroundColor }
      })
    expect(
      contrastRatio(parseColor(bottomColors.foreground), parseColor(bottomColors.background))
    ).toBeGreaterThanOrEqual(4.5)
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
      expect(
        contrastRatio(parseColor(hover.foreground), parseColor(hover.background))
      ).toBeGreaterThanOrEqual(4.5)
      expect(hover.foreground).not.toBe(resting)

      await page.mouse.move(0, 0)
      await focusWithKeyboard(page, link)
      const focus = await colorsFor(link, background)
      expect(
        contrastRatio(parseColor(focus.foreground), parseColor(focus.background))
      ).toBeGreaterThanOrEqual(4.5)
      expect(focus.foreground).not.toBe(resting)
    }
  }
})

test('dark mode keeps Hero Series metadata on the Posted by treatment', async ({ page }) => {
  await page.goto('/2026/07/25/openwiki-tame-agents-md/')
  await setTheme(page, 'dark')

  // 暗色模式不得讓 .dark .post-series-link-top 的文章灰滲進 Hero,
  // 這行(含連結)必須維持圖片上的 Posted by 白。
  const heroColors = await page.locator('.post-heading').evaluate((element) => ({
    posted: getComputedStyle(element.querySelector('.meta')!).color,
    series: getComputedStyle(element.querySelector('.series-meta')!).color,
    seriesLink: getComputedStyle(element.querySelector('.series-meta a')!).color,
  }))
  expect(heroColors.series).toBe(heroColors.posted)
  expect(heroColors.seriesLink).toBe(heroColors.posted)
})

test('desktop primary navigation keeps the exact Series order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  await expect(page.locator('.navbar-links > a')).toHaveText(['Home', 'About', 'Series', 'Archive'])
})
