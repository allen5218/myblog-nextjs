import { test, expect } from '@playwright/test'
import sharp from 'sharp'

function pngDimensions(buffer: Buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function pixelAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return { red: data[offset], green: data[offset + 1], blue: data[offset + 2] }
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

test('gradient-backed post exposes its dedicated social card', async ({ page, request }) => {
  const postPath = '/2026/04/26/learning-how-to-learn/'
  const imagePath = '/2026/04/26/learning-how-to-learn/opengraph-image'

  await page.goto(postPath)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    new RegExp(`${imagePath}$`)
  )
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    new RegExp(`${imagePath}$`)
  )

  const response = await request.get(imagePath)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/png')
  const image = await response.body()
  expect(pngDimensions(image)).toEqual({ width: 1200, height: 630 })
  const gradientPixel = await pixelAt(image, 150, 250)
  expect(Math.max(gradientPixel.red, gradientPixel.green, gradientPixel.blue)).toBeGreaterThan(70)
  expect(gradientPixel.blue - gradientPixel.red).toBeGreaterThan(8)
  expect(gradientPixel.red - gradientPixel.green).toBeGreaterThan(5)
})

test('header-image post generates a valid dedicated social card', async ({ request }) => {
  const response = await request.get(
    '/2025/11/08/deploying-openwebui-for-free-with-cloudflare-tunnel/opengraph-image'
  )

  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(pngDimensions(await response.body())).toEqual({ width: 1200, height: 630 })
})
