import { expect, test } from '@playwright/test'

const postPath = '/2026/07/14/kamiina-botan-anime-review/'

test('Giscus loads once when comments approach and keeps its theme in sync', async ({ page }) => {
  const giscusRequests: string[] = []

  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'dark')

    const themes: string[] = []
    const rootMargins: string[] = []
    Object.assign(window, {
      __commentsObserverRootMargins: rootMargins,
      __mockGiscusThemes: themes,
    })
    const NativeIntersectionObserver = window.IntersectionObserver
    window.IntersectionObserver = new Proxy(NativeIntersectionObserver, {
      construct(Target, args) {
        rootMargins.push((args[1] as IntersectionObserverInit | undefined)?.rootMargin ?? '')
        return new Target(...args)
      },
    })
    window.addEventListener('message', (event) => {
      if (typeof event.data?.mockGiscusTheme === 'string') {
        themes.push(event.data.mockGiscusTheme)
      }
    })
  })
  await page.route('https://giscus.app/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><script>
        addEventListener('message', ({ data }) => {
          const theme = data?.giscus?.setConfig?.theme
          if (theme) parent.postMessage({ mockGiscusTheme: theme }, '*')
        })
      </script>`,
    })
  )
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'giscus.app') giscusRequests.push(request.url())
  })

  await page.goto(postPath)

  const comments = page.locator('#comments-container')
  await expect(comments).toBeAttached()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __commentsObserverRootMargins: string[] })
            .__commentsObserverRootMargins
      )
    )
    .toContain('1000px 0px 1000px 0px')
  expect(await comments.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(
    page.viewportSize()!.height + 1_000
  )
  await page.waitForTimeout(500)
  await expect(page.locator('iframe[src*="giscus.app"]')).toHaveCount(0)
  expect(giscusRequests).toEqual([])

  await comments.scrollIntoViewIfNeeded()

  const frame = page.locator('#comments-container iframe[src*="giscus.app"]')
  await expect(frame).toHaveCount(1)
  await expect(frame).toHaveAttribute('src', /theme=dark_dimmed/)
  await expect.poll(() => giscusRequests.length).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __mockGiscusThemes: string[] }).__mockGiscusThemes
      )
    )
    .toContain('dark_dimmed')

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Theme switcher' }).click()
  await page.getByRole('menuitem', { name: 'Light' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __mockGiscusThemes: string[] }).__mockGiscusThemes
      )
    )
    .toContain('light')
  await expect(frame).toHaveCount(1)
  expect(giscusRequests).toHaveLength(1)
})
