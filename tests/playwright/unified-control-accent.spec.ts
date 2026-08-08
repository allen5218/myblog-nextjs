import { expect, test, type Locator, type Page } from '@playwright/test'
import { focusWithKeyboard } from '../helpers/focus'

const accent = 'rgb(58, 131, 158)'
const middleArticlePath = '/2025/10/12/ai-learning-community/'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page
    .locator('html')
    .evaluate((element, dark) => element.classList.toggle('dark', dark), theme === 'dark')
}

async function scrollPastBackTopThreshold(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

async function expectHoverAndKeyboardFocusAccent(
  page: Page,
  target: Locator,
  property = 'background-color'
) {
  await target.hover()
  await expect(target).toHaveCSS(property, accent)

  // focus 必須脫離 :hover 後單獨量:若游標還停在目標上,刪掉 :focus 規則仍會由 hover 假綠。
  await page.mouse.move(0, 0)
  await focusWithKeyboard(page, target)
  await expect(target).toBeFocused()
  await expect(target).toHaveCSS(property, accent)
}

async function openKBar(page: Page) {
  await page.getByLabel('Search').click()
  await expect(page.locator('input[aria-controls="kbar-listbox"]')).toBeVisible()
}

test('article pager keeps the two-line classic Previous and Next contract without arrows', async ({
  page,
}) => {
  await page.goto(middleArticlePath)

  for (const [item, label] of [
    ['previous', 'Previous'],
    ['next', 'Next'],
  ] as const) {
    const link = page.locator(`.post-container > .pager > .${item} > a`)
    await expect(link).toBeVisible()
    await expect(link.locator(':scope > *')).toHaveCount(2)
    expect(
      await link
        .locator(':scope > *')
        .evaluateAll((elements) => elements.map((element) => element.className))
    ).toEqual(['pager-label', 'pager-title'])
    await expect(link.locator('.pager-label')).toHaveText(label)
    await expect(link.locator('.pager-title')).not.toHaveText('')
    expect(await link.textContent()).not.toMatch(/[←→]/)
    await expect(link.locator('.pager-label')).toHaveCSS('display', 'block')
    await expect(link.locator('.pager-title')).toHaveCSS('display', 'block')
    await expect(link.locator('.pager-label')).toHaveCSS('font-weight', '800')
    await expect(link.locator('.pager-title')).toHaveCSS('font-weight', '400')
    await expect(link.locator('.pager-title')).toHaveCSS('letter-spacing', '0.5px')
  }
})

test('list and article pagers keep their distinct Hux markup and responsive geometry', async ({
  page,
}) => {
  for (const [width, pagerWidth, slotWidth] of [
    [320, 275, 132],
    [390, 345, 165.6],
    [768, 697.5, 334.8],
    [1200, 706.5, 339.12],
  ]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(middleArticlePath)

    const articlePager = page.locator('.post-container > .pager-article')
    const articleItems = articlePager.locator(':scope > li')
    await expect(articleItems).toHaveCount(2)
    await expect(articlePager.locator('.pager-label, .pager-title')).toHaveCount(4)
    const articleGeometry = await articlePager.evaluate((pager) => {
      const pagerRect = pager.getBoundingClientRect()
      const items = Array.from(pager.children).map((item) => {
        const itemRect = item.getBoundingClientRect()
        const linkRect = item.querySelector('a')!.getBoundingClientRect()
        return { width: itemRect.width, linkWidth: linkRect.width, linkHeight: linkRect.height }
      })
      return { width: pagerRect.width, items }
    })
    expect(articleGeometry.width).toBeCloseTo(pagerWidth, 1)
    for (const item of articleGeometry.items) {
      expect(item.width).toBeCloseTo(slotWidth, 1)
      expect(item.linkWidth).toBeCloseTo(slotWidth, 1)
    }
    expect(articleGeometry.items[1].linkHeight).toBeGreaterThan(articleGeometry.items[0].linkHeight)

    const articleLink = articlePager.locator('.previous > a')
    await expect(articleLink).toHaveCSS('text-align', 'center')
    await expect(articleLink).toHaveCSS('font-size', width < 768 ? '13px' : '14px')
    await expect(articleLink).toHaveCSS('line-height', width < 768 ? '22.1px' : '23.8px')
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(articleLink).toHaveCSS(
        `padding-${side}`,
        width < 768 ? '10px' : side === 'left' || side === 'right' ? '25px' : '15px'
      )
    }
  }

  for (const [path, className, text] of [
    ['/', 'next', 'Older Posts →'],
    ['/page2/', 'previous', '← Newer Posts'],
  ] as const) {
    for (const width of [320, 375, 768, 1200]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(path)
      const listPager = page.locator('.postlist-container > .pager-list')
      const link = listPager.locator(`.${className} > a`)
      await expect(link).toHaveText(text)
      await expect(link.locator(':scope > *')).toHaveCount(0)
      await expect(listPager.locator('.pager-label, .pager-title')).toHaveCount(0)
      await expect(link).toHaveCSS('white-space', 'nowrap')
      await expect(link).toHaveCSS('font-size', width < 768 ? '13px' : '14px')
      for (const side of ['top', 'right', 'bottom', 'left']) {
        await expect(link).toHaveCSS(
          `padding-${side}`,
          width < 768 ? '10px' : side === 'left' || side === 'right' ? '25px' : '15px'
        )
      }
      const geometry = await listPager.evaluate((pager, itemClass) => {
        const pagerRect = pager.getBoundingClientRect()
        const itemRect = pager.querySelector(`.${itemClass}`)!.getBoundingClientRect()
        const linkRect = pager.querySelector(`.${itemClass} a`)!.getBoundingClientRect()
        return {
          pagerLeft: pagerRect.left,
          pagerRight: pagerRect.right,
          itemLeft: itemRect.left,
          itemRight: itemRect.right,
          linkLeft: linkRect.left,
          linkRight: linkRect.right,
        }
      }, className)
      if (className === 'previous') {
        expect(geometry.itemLeft).toBeCloseTo(geometry.pagerLeft, 1)
        expect(geometry.linkLeft).toBeCloseTo(geometry.pagerLeft, 1)
      } else {
        expect(geometry.itemRight).toBeCloseTo(geometry.pagerRight, 1)
        expect(geometry.linkRight).toBeCloseTo(geometry.pagerRight, 1)
      }
    }
  }
})

test('two-sided list pager wraps only at 320px with no gap between rows', async ({ page }) => {
  for (const width of [320, 321, 375]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.locator('.postlist-container > .pager-list').evaluate((pager) => {
      const item = document.createElement('li')
      item.className = 'previous'
      const link = document.createElement('a')
      link.href = '#'
      link.textContent = '← Newer Posts'
      item.append(link)
      pager.prepend(item)
    })

    const geometry = await page.locator('.postlist-container > .pager-list').evaluate((pager) => {
      const pagerRect = pager.getBoundingClientRect()
      const previousRect = pager.querySelector(':scope > .previous')!.getBoundingClientRect()
      const nextRect = pager.querySelector(':scope > .next')!.getBoundingClientRect()
      const previousLinkRect = pager
        .querySelector(':scope > .previous > a')!
        .getBoundingClientRect()
      const nextLinkRect = pager.querySelector(':scope > .next > a')!.getBoundingClientRect()
      return {
        rowGap: getComputedStyle(pager).rowGap,
        pagerLeft: pagerRect.left,
        pagerRight: pagerRect.right,
        pagerWidth: pagerRect.width,
        previousTop: previousRect.top,
        previousBottom: previousRect.bottom,
        previousWidth: previousRect.width,
        previousLinkLeft: previousLinkRect.left,
        nextTop: nextRect.top,
        nextWidth: nextRect.width,
        nextLinkRight: nextLinkRect.right,
      }
    })

    expect(geometry.previousLinkLeft).toBeCloseTo(geometry.pagerLeft, 1)
    expect(geometry.nextLinkRight).toBeCloseTo(geometry.pagerRight, 1)
    if (width === 320) {
      expect(geometry.rowGap).toBe('0px')
      expect(geometry.previousWidth).toBeCloseTo(geometry.pagerWidth, 1)
      expect(geometry.nextWidth).toBeCloseTo(geometry.pagerWidth, 1)
      expect(geometry.nextTop).toBeCloseTo(geometry.previousBottom, 1)
    } else {
      expect(geometry.nextTop).toBeCloseTo(geometry.previousTop, 1)
    }
  }
})

test('single article pager links keep their classic boundary slots without overflow', async ({
  page,
}) => {
  for (const [path, itemClass] of [
    ['/2026/07/25/openwiki-tame-agents-md/', 'previous'],
    ['/2021/04/30/typora-latex-mathjax/', 'next'],
  ] as const) {
    for (const width of [320, 390, 768, 1200]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(path)

      const geometry = await page
        .locator('.post-container > .pager-article')
        .evaluate((pager, expectedClass) => {
          const pagerRect = pager.getBoundingClientRect()
          const item = pager.querySelector(`:scope > .${expectedClass}`)!
          const itemRect = item.getBoundingClientRect()
          const linkRect = item.querySelector('a')!.getBoundingClientRect()
          return {
            itemCount: pager.children.length,
            pagerLeft: pagerRect.left,
            pagerRight: pagerRect.right,
            pagerWidth: pagerRect.width,
            itemLeft: itemRect.left,
            itemRight: itemRect.right,
            itemWidth: itemRect.width,
            linkLeft: linkRect.left,
            linkRight: linkRect.right,
            linkWidth: linkRect.width,
          }
        }, itemClass)

      expect(geometry.itemCount).toBe(1)
      expect(geometry.itemWidth).toBeCloseTo(geometry.pagerWidth * 0.48, 1)
      expect(geometry.linkWidth).toBeCloseTo(geometry.itemWidth, 1)
      expect(geometry.linkLeft).toBeGreaterThanOrEqual(geometry.pagerLeft)
      expect(geometry.linkRight).toBeLessThanOrEqual(geometry.pagerRight)
      if (itemClass === 'previous') {
        expect(geometry.itemLeft).toBeCloseTo(geometry.pagerLeft, 1)
      } else {
        expect(geometry.itemRight).toBeCloseTo(geometry.pagerRight, 1)
      }
    }
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: pager title keeps its muted rest style, white active style, and responsive link metrics`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(middleArticlePath)
    await setTheme(page, theme)

    const pager = page.locator('.post-container > .pager > .previous > a')
    const title = pager.locator('.pager-title')
    const label = pager.locator('.pager-label')
    await expect(title).toHaveCSS('color', 'rgb(163, 163, 163)')
    await expect(pager).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(45, 45, 45)'
    )
    await expect(pager).toHaveCSS('border-color', 'rgb(221, 221, 221)')
    await expect(pager).toHaveCSS('font-size', '13px')
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(pager).toHaveCSS(`padding-${side}`, '10px')
    }

    await pager.hover()
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(label).toHaveCSS('color', 'rgb(255, 255, 255)')
    await page.mouse.move(0, 0)
    await focusWithKeyboard(page, pager)
    await expect(pager).toBeFocused()
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(label).toHaveCSS('color', 'rgb(255, 255, 255)')

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(pager).toHaveCSS('font-size', '14px')
    for (const [side, value] of [
      ['top', '15px'],
      ['right', '25px'],
      ['bottom', '15px'],
      ['left', '25px'],
    ]) {
      await expect(pager).toHaveCSS(`padding-${side}`, value)
    }
  })

  test(`${theme}: pager and Back to top use one control accent for hover and keyboard focus`, async ({
    page,
  }) => {
    await page.goto(middleArticlePath)
    await setTheme(page, theme)

    const pager = page.locator('.post-container > .pager > .previous > a')
    await expectHoverAndKeyboardFocusAccent(page, pager)

    await scrollPastBackTopThreshold(page)
    const backTop = page.locator('.hux-elevator-control')
    await expect(backTop).toHaveClass(/hux-elevator-control-visible/)
    await expectHoverAndKeyboardFocusAccent(page, backTop)
  })

  test(`${theme}: KBar active result, hovered result, and Content label use the control accent`, async ({
    page,
  }) => {
    await page.goto('/')
    await setTheme(page, theme)
    await openKBar(page)
    await page.locator('input[aria-controls="kbar-listbox"]').fill('AI')

    const activeResult = page.locator(
      '#kbar-listbox [role="option"][aria-selected="true"] > div > .cursor-pointer'
    )
    await expect(activeResult).toHaveCSS('background-color', accent)

    const options = page.locator('#kbar-listbox [role="option"]')
    await expect.poll(() => options.count()).toBeGreaterThanOrEqual(3)
    const hoveredOption = options.nth(2)
    await expect(hoveredOption).toHaveAttribute('aria-selected', 'false')
    const hoveredResult = hoveredOption.locator(':scope > div > .cursor-pointer')
    // KBar 的 pointermove 預設會把滑過項同步成 active,會讓 active selector 代償 hover。
    // 在 capture phase 攔下事件仍保留瀏覽器的 :hover,但隔離 KBar 的 selection state。
    await page.evaluate(() =>
      document.addEventListener('pointermove', (event) => event.stopPropagation(), {
        capture: true,
      })
    )
    await hoveredResult.hover()
    await expect(hoveredOption).toHaveAttribute('aria-selected', 'false')
    await expect(hoveredResult).toHaveCSS('background-color', accent)

    const contentLabel = page.locator('#kbar-listbox .text-primary-600')
    await expect(contentLabel).toHaveText('Content')
    await expect(contentLabel).toHaveCSS('color', accent)
  })
}
