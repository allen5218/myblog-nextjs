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

async function expectHoverAndKeyboardFocusAccent(page: Page, target: Locator, property = 'background-color') {
  await target.hover()
  await expect(target).toHaveCSS(property, accent)
  await focusWithKeyboard(page, target)
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
    await expect(link.locator('.pager-title')).toHaveCSS('font-weight', '400')
    await expect(link.locator('.pager-title')).toHaveCSS('letter-spacing', '0.5px')
  }
})

for (const theme of ['light', 'dark'] as const) {
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
    await page.locator('input[aria-controls="kbar-listbox"]').fill('防火')

    const activeResult = page.locator('#kbar-listbox [role="option"][aria-selected="true"] > div')
    await expect(activeResult).toHaveCSS('background-color', accent)

    const hoveredResult = page
      .locator('#kbar-listbox [role="option"]')
      .filter({ hasText: '你的防火牆很強' })
      .locator(':scope > div')
    await hoveredResult.hover()
    await expect(hoveredResult).toHaveCSS('background-color', accent)

    const contentLabel = page.locator('#kbar-listbox .text-primary-600')
    await expect(contentLabel).toHaveText('Content')
    await expect(contentLabel).toHaveCSS('color', accent)
  })
}
