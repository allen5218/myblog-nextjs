import { expect, test } from '@playwright/test'

const postPath = '/2026/07/13/vaultwarden-cloudflare-tunnel/'
const aboutPath = '/about/'

test('文章正文在平板與窄桌面維持 Hux 的可讀行寬', async ({ page }) => {
  const cases = [
    { viewportWidth: 767, expectedProseWidth: 737 },
    { viewportWidth: 768, expectedProseWidth: 697.5 },
    { viewportWidth: 834, expectedProseWidth: 697.5 },
    { viewportWidth: 991, expectedProseWidth: 697.5 },
    { viewportWidth: 992, expectedProseWidth: 744.8 },
    { viewportWidth: 1048, expectedProseWidth: 744.8 },
    { viewportWidth: 1199, expectedProseWidth: 744.8 },
    { viewportWidth: 1200, expectedProseWidth: 706.5 },
  ]

  for (const { viewportWidth, expectedProseWidth } of cases) {
    await page.setViewportSize({ width: viewportWidth, height: 900 })
    await page.goto(postPath)

    const proseWidth = await page
      .locator('.post-container .prose')
      .evaluate((element) => element.getBoundingClientRect().width)

    expect(proseWidth).toBeCloseTo(expectedProseWidth, 0)
  }
})

test('文章在 320 CSS px 維持單欄 reflow 且不產生整頁水平捲動', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(postPath)

  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    proseWidth: document.querySelector('.post-container .prose')!.getBoundingClientRect().width,
  }))

  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.proseWidth).toBe(290)
})

test('About 正文維持窄欄並在 viewport 水平置中', async ({ page }) => {
  const cases = [
    { viewportWidth: 390, expectedProseWidth: 360 },
    { viewportWidth: 850, expectedProseWidth: 750 },
    { viewportWidth: 1100, expectedProseWidth: 750 },
    { viewportWidth: 1250, expectedProseWidth: 750 },
  ]

  for (const { viewportWidth, expectedProseWidth } of cases) {
    await page.setViewportSize({ width: viewportWidth, height: 900 })
    await page.goto(aboutPath)

    const geometry = await page.evaluate(() => {
      const prose = document.querySelector('.about-container .prose')!.getBoundingClientRect()

      return {
        proseWidth: prose.width,
        centerOffset: prose.left + prose.width / 2 - window.innerWidth / 2,
      }
    })

    expect(geometry.proseWidth).toBe(expectedProseWidth)
    expect(geometry.centerOffset).toBeCloseTo(0, 0)
  }
})
