import { test, expect } from '@playwright/test'

function pngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

test('home exposes a generated 1200x630 large social card', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/opengraph-image/
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  )
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    /\/opengraph-image/
  )

  const response = await request.get('/opengraph-image')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(pngDimensions(await response.body())).toEqual({ width: 1200, height: 630 })
})
