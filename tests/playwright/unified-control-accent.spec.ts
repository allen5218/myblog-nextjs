import { expect, test, type Locator, type Page } from '@playwright/test'
import { contrastRatio, parseColor } from '../helpers/color'
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
  // 這裡刻意不釘死絕對像素(舊版是 275 / 345 / 697.5 / 706.5)。那些數字混進了「.post-shell
  // 怎麼從 viewport 算出寬度」這條與 pager 無關的鏈,而該鏈曾經含 `100vw`(含捲軸寬)——
  // headless Chromium 一律 overlay 捲軸,`100vw === 100%`,絕對值在 CI 永遠成立,傳統捲軸的
  // 真實桌面卻會整組差一個捲軸寬。改成從量測基準(.post-container 的內容盒)自己推期望值:
  // 上游容器寬度怎麼變都跟著走,被守住的是 pager 自己的比例契約。
  for (const width of [320, 390, 768, 1200]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(middleArticlePath)

    const articlePager = page.locator('.post-container > .pager-article')
    const articleItems = articlePager.locator(':scope > li')
    await expect(articleItems).toHaveCount(2)
    await expect(articlePager.locator('.pager-label, .pager-title')).toHaveCount(4)
    const articleGeometry = await articlePager.evaluate((pager) => {
      const container = pager.closest('.post-container')!
      const containerRect = container.getBoundingClientRect()
      const containerStyle = getComputedStyle(container)
      const pagerRect = pager.getBoundingClientRect()
      const pagerStyle = getComputedStyle(pager)
      const items = Array.from(pager.children).map((item) => {
        const itemRect = item.getBoundingClientRect()
        const link = item.querySelector('a')!
        const title = item.querySelector('.pager-title')!
        const titleStyle = getComputedStyle(title)
        const linkRect = link.getBoundingClientRect()
        return {
          left: itemRect.left,
          right: itemRect.right,
          width: itemRect.width,
          height: itemRect.height,
          linkWidth: linkRect.width,
          linkHeight: linkRect.height,
          // 標題換幾行才是高度差的成因。直接斷言「第二個比較高」會綁死這兩篇鄰居文章的
          // 標題長度 —— 中間插一篇短標題的文章就會紅。
          titleLines: Math.round(
            title.getBoundingClientRect().height / parseFloat(titleStyle.lineHeight)
          ),
        }
      })
      return {
        contentLeft: containerRect.left + parseFloat(containerStyle.paddingLeft),
        contentRight: containerRect.right - parseFloat(containerStyle.paddingRight),
        marginLeft: parseFloat(pagerStyle.marginLeft),
        marginRight: parseFloat(pagerStyle.marginRight),
        left: pagerRect.left,
        right: pagerRect.right,
        width: pagerRect.width,
        items,
      }
    })

    // 契約一:相對 .post-container 的內容盒,手機版左右各內縮 7.5px,≥768px 貼齊。
    const expectedInset = width < 768 ? 7.5 : 0
    expect(articleGeometry.marginLeft).toBeCloseTo(expectedInset, 1)
    expect(articleGeometry.marginRight).toBeCloseTo(expectedInset, 1)
    expect(articleGeometry.left - articleGeometry.contentLeft).toBeCloseTo(expectedInset, 1)
    expect(articleGeometry.contentRight - articleGeometry.right).toBeCloseTo(expectedInset, 1)

    const [previous, next] = articleGeometry.items
    // 契約二:每個 slot 佔 pager 的 48%。契約三:中間間隔佔 4%。
    for (const item of articleGeometry.items) {
      expect(item.width / articleGeometry.width).toBeCloseTo(0.48, 3)
      // 契約四:anchor 填滿自己的 slot(.pager a 的 max-width: 339px 不得回到 article variant)
      expect(item.linkWidth).toBeCloseTo(item.width, 1)
    }
    expect((next.left - previous.right) / articleGeometry.width).toBeCloseTo(0.04, 3)

    // 契約五:Previous / Next 各自貼齊 pager 的左右邊界。
    expect(previous.left).toBeCloseTo(articleGeometry.left, 1)
    expect(next.right).toBeCloseTo(articleGeometry.right, 1)

    // 契約六:標題長度只改高度、不改寬度。兩個方向都斷言,才不必依賴「這兩篇鄰居文章的
    // 標題剛好一長一短」—— 寬 slot 下兩者可能都只佔一行,那時該成立的是等高。
    expect(previous.linkWidth).toBeCloseTo(next.linkWidth, 1)
    if (previous.titleLines === next.titleLines) {
      expect(previous.linkHeight).toBeCloseTo(next.linkHeight, 1)
    } else {
      const taller = previous.titleLines > next.titleLines ? previous : next
      const shorter = previous.titleLines > next.titleLines ? next : previous
      expect(taller.linkHeight).toBeGreaterThan(shorter.linkHeight)
    }

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

test('plain 404 and offline pagers keep their single action centered', async ({ page }) => {
  for (const path of ['/pager-missing-page/', '/offline/']) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)

      const geometry = await page.locator('ul.pager').evaluate((pager) => {
        const pagerRect = pager.getBoundingClientRect()
        const itemRect = pager.querySelector(':scope > li')!.getBoundingClientRect()
        const linkRect = pager.querySelector(':scope > li > a')!.getBoundingClientRect()
        return {
          itemCount: pager.children.length,
          pagerCenter: pagerRect.left + pagerRect.width / 2,
          itemCenter: itemRect.left + itemRect.width / 2,
          linkCenter: linkRect.left + linkRect.width / 2,
        }
      })

      expect(geometry.itemCount).toBe(1)
      expect(geometry.itemCenter).toBeCloseTo(geometry.pagerCenter, 1)
      expect(geometry.linkCenter).toBeCloseTo(geometry.pagerCenter, 1)
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
    await expect(pager).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(45, 45, 45)'
    )
    const restingColors = await title.evaluate((element) => {
      const titleStyle = getComputedStyle(element)
      const linkStyle = getComputedStyle(element.closest('a')!)
      return { foreground: titleStyle.color, background: linkStyle.backgroundColor }
    })
    expect(restingColors.foreground).toBe(
      theme === 'light' ? 'rgb(115, 115, 115)' : 'rgb(163, 163, 163)'
    )
    expect(
      contrastRatio(parseColor(restingColors.foreground), parseColor(restingColors.background))
    ).toBeGreaterThanOrEqual(4.5)
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

  test(`${theme}: ThemeSwitch options use the control accent for hover and keyboard focus`, async ({
    page,
  }) => {
    await page.goto('/')
    await setTheme(page, theme)

    await page.locator('.navbar-links .theme-switch-button').click()
    const items = page.locator('.navbar-links [role="menu"] button')
    await expect(items).toHaveCount(3)

    // 三個 option 都各自持有 focus render branch；逐一真實 hover，避免只改到其中一個。
    for (const item of await items.all()) {
      await item.hover()
      await expect(item).toHaveCSS('background-color', accent)
      await expect(item).toHaveCSS('color', 'rgb(255, 255, 255)')
    }

    // HeadlessUI 把 DOM focus 留在 menu，並以 aria-activedescendant / data-focus 表示
    // 鍵盤 active option。移開滑鼠再按 ArrowDown，確保不是 :hover 代償 focus branch。
    await page.mouse.move(0, 0)
    await page.locator('.navbar-links [role="menu"]').focus()
    await page.keyboard.press('ArrowDown')
    const keyboardActive = page.locator('.navbar-links [role="menu"] button[data-focus]')
    await expect(keyboardActive).toHaveCount(1)
    await expect(keyboardActive).toHaveCSS('background-color', accent)
    await expect(keyboardActive).toHaveCSS('color', 'rgb(255, 255, 255)')
  })
}
