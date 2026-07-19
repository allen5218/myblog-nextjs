import { expect, test } from '@playwright/test'

const validAiPath = '/2025/10/12/ai-learning-community/'
const invalidAiPath = '/2025/10/13/ai-learning-community/'
const hiddenPath = '/2025/08/16/catalog-test/'
const openWebUiPath = '/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/'
const mathPath = '/2021/04/30/typora-latex-mathjax/'
const learningPath = '/2026/04/26/learning-how-to-learn/'
const blockquotePath = '/2025/08/16/blockquote-test/'
const kamiinaPath = '/2026/07/14/kamiina-botan-anime-review/'
const validAiUrl = `https://blog.allenspace.de${validAiPath}`
const validAiUrlWithoutSlash = validAiUrl.replace(/\/$/, '')

test('listed surfaces use legacy URLs and keep hidden posts out', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveTitle("Allen's Blog")
  // 首頁就是分頁的第 1 頁,列出的文章會隨新文章滾動,所以只驗證卡片輸出 legacy URL 格式,
  // 不釘特定文章;「AI 文章 = 這個精確 legacy URL」由下方 /archive/ 與 search.json 釘定。
  await expect(page.locator('.hux-post-list .post-preview a').first()).toHaveAttribute(
    'href',
    /^\/20\d\d\/\d\d\/\d\d\/[^/]+\/$/
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
  // 桌面與手機各有一個搜尋按鈕,限定桌面導覽區避免 strict-mode 命中兩個
  await page.locator('.navbar-links').getByLabel('Search').click()
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
  await expect(page.locator('article[lang="zh-TW"]')).toContainText('嗨，我是與倫')
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/en/about/')

  await page.getByRole('link', { name: 'English' }).click()
  await page.waitForURL('**/en/about/')
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
  await expect(page.locator('article[lang="en"]')).toContainText("Hi, I'm Allen")
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

test('post hero and navigation geometry matches the legacy layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(learningPath)

  const desktopGeometry = await page.evaluate(() => {
    const brand = document.querySelector<HTMLElement>('.navbar-brand')!.getBoundingClientRect()
    const links = document.querySelector<HTMLElement>('.navbar-links')!.getBoundingClientRect()
    const tags = document.querySelector<HTMLElement>('.post-heading .tags')!.getBoundingClientRect()
    const title = document
      .querySelector<HTMLElement>('.post-heading .tags + h1')!
      .getBoundingClientRect()

    return {
      brandLeft: brand.left,
      linksRight: links.right,
      tagToTitleGap: title.top - tags.bottom,
    }
  })

  expect(desktopGeometry.brandLeft).toBeCloseTo(0, 0)
  expect(desktopGeometry.linksRight).toBeCloseTo(1440, 0)
  expect(desktopGeometry.tagToTitleGap).toBeCloseTo(15, 0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()

  const mobileGeometry = await page.evaluate(() => {
    const brand = document.querySelector<HTMLElement>('.navbar-brand')!.getBoundingClientRect()
    const tools = document.querySelector<HTMLElement>('.navbar-mobile')!.getBoundingClientRect()
    const themeButton = document
      .querySelector<HTMLElement>('.navbar-mobile .theme-switch-button')!
      .getBoundingClientRect()
    const navButton = document.querySelector<HTMLElement>('.navbar-toggle')!.getBoundingClientRect()
    const hero = document.querySelector<HTMLElement>('.intro-header-post')!.getBoundingClientRect()
    const heading = document.querySelector<HTMLElement>('.post-heading')!.getBoundingClientRect()
    const tags = document.querySelector<HTMLElement>('.post-heading .tags')!.getBoundingClientRect()
    const title = document
      .querySelector<HTMLElement>('.post-heading .tags + h1')!
      .getBoundingClientRect()

    return {
      brandLeft: brand.left,
      toolsRight: tools.right,
      themeButtonWidth: themeButton.width,
      themeButtonHeight: themeButton.height,
      navButtonWidth: navButton.width,
      navButtonHeight: navButton.height,
      heroHeight: hero.height,
      headingTop: heading.top,
      tagToTitleGap: title.top - tags.bottom,
    }
  })

  expect(mobileGeometry.brandLeft).toBeCloseTo(0, 0)
  expect(mobileGeometry.toolsRight).toBeCloseTo(390, 0)
  expect(mobileGeometry.themeButtonWidth).toBe(44)
  expect(mobileGeometry.themeButtonHeight).toBe(44)
  expect(mobileGeometry.navButtonWidth).toBe(44)
  expect(mobileGeometry.navButtonHeight).toBe(44)
  expect(mobileGeometry.heroHeight).toBeGreaterThanOrEqual(300)
  expect(mobileGeometry.heroHeight).toBeLessThanOrEqual(320)
  expect(mobileGeometry.headingTop).toBeCloseTo(85, 0)
  expect(mobileGeometry.tagToTitleGap).toBeCloseTo(15, 0)
  await expect(page.locator('.navbar-mobile').getByLabel('Theme switcher')).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Toggle navigation' })).toHaveCount(0)
})

test('blockquote wraps an unbroken string within its content box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(blockquotePath)

  const geometry = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((node) =>
      node.textContent?.includes('測試案例 4')
    )
    const paragraph = heading?.nextElementSibling?.querySelector('p')
    if (!paragraph) throw new Error('Blockquote test case 4 is missing')

    return {
      clientWidth: paragraph.clientWidth,
      scrollWidth: paragraph.scrollWidth,
      overflowWrap: getComputedStyle(paragraph).overflowWrap,
    }
  })

  expect(geometry.overflowWrap).toBe('break-word')
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
})

test('dark article separators match the table of contents border', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(kamiinaPath)

  const separator = page.locator('.post-container .prose hr').first()
  const tableOfContents = page.locator('.article-toc')

  await expect(separator).toHaveCSS('border-top-color', 'rgb(68, 68, 68)')
  await expect(tableOfContents).toHaveCSS('border-top-color', 'rgb(68, 68, 68)')
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
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.locator('.table-responsive').evaluate((el) => el.scrollWidth > el.clientWidth))
    .toBe(true)
})

test('mobile keynote is compact and light pager borders match the classic theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(validAiPath)

  const keynote = page.locator('.intro-header-keynote')
  await expect(keynote).toHaveCSS('height', '633px')
  await expect(keynote).toHaveCSS('min-height', '0px')

  await page.goto('/')
  const pagerLink = page.locator('.pager a').first()
  await expect(pagerLink).toBeVisible()
  await expect(pagerLink).toHaveCSS('border-color', 'rgb(221, 221, 221)')
})

test('service worker keeps the cross-origin post hero image available', async ({ page }) => {
  await page.goto(openWebUiPath)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  })

  await page.reload({ waitUntil: 'domcontentloaded' })

  const heroImageWidth = await page.locator('.intro-header-post').evaluate(async (hero) => {
    const backgroundImage = getComputedStyle(hero).backgroundImage
    const url = backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]
    if (!url) return 0

    return new Promise<number>((resolve) => {
      const image = new Image()
      image.onload = () => resolve(image.naturalWidth)
      image.onerror = () => resolve(0)
      image.src = `${url}?service-worker-probe=${Date.now()}`
    })
  })

  expect(heroImageWidth).toBeGreaterThan(0)
})
