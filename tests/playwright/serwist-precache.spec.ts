import { expect, test } from '@playwright/test'

test('service worker 只預快取離線後備頁', async ({ request }) => {
  const response = await request.get('/serwist/sw.js')
  expect(response.ok()).toBe(true)

  const source = await response.text()
  expect(source).toContain('url:"/offline/"')
  expect(source).not.toContain('/static/images/')
  expect(source).not.toContain('/static/fonts/ChironSungHK-OG-')
  expect(source).not.toContain('/_next/static/chunks/')
})

test('未瀏覽過的頁面在離線時仍顯示後備頁', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()

  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  })

  await context.setOffline(true)
  await page.goto('/never-visited-before/')
  await expect(page.getByRole('heading', { name: '離線' })).toBeVisible()

  await context.close()
})
