import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type FontArtifact = {
  role: 'core' | 'supplemental'
  bucket: number | null
  file: string
  bytes: number
  codePoints: string[]
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'public/static/fonts/chiron/manifest.json'), 'utf8')
) as { artifacts: FontArtifact[] }

const fontPath = '/static/fonts/chiron/'
const coreBytes = 295_888
const homeBudget = 350_000
const articleBudget = 550_000
const articleRequestBudget = 3

function artifactForUrl(url: string) {
  const file = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '')
  return manifest.artifacts.find((artifact) => artifact.file === file)
}

async function renderedChironCodePoints(page: Page) {
  return page.locator('body').evaluate((body) => {
    const codePoints = new Set<number>()
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue
      const style = getComputedStyle(parent)
      if (
        !style.fontFamily.includes('Chiron Sung HK') ||
        style.display === 'none' ||
        style.visibility === 'hidden'
      ) {
        continue
      }
      for (const character of walker.currentNode.textContent ?? '') {
        codePoints.add(character.codePointAt(0)!)
      }
    }

    return [...codePoints]
  })
}

function expectedArtifacts(codePoints: number[]) {
  const rendered = new Set(codePoints)
  return manifest.artifacts.filter((artifact) =>
    artifact.codePoints.some((hex) => rendered.has(Number.parseInt(hex, 16)))
  )
}

async function loadWithFontRequests(page: Page, path: string) {
  const requests = new Set<string>()
  page.on('request', (request) => {
    if (request.resourceType() === 'font') requests.add(request.url())
  })

  await page.goto(path)
  await page.evaluate(() => document.fonts.ready)
  return [...requests]
}

function requestedArtifacts(fontRequests: string[]) {
  expect(fontRequests.length).toBeGreaterThan(0)
  expect(fontRequests.every((url) => new URL(url).pathname.startsWith(fontPath))).toBe(true)
  const artifacts = fontRequests.map(artifactForUrl)
  expect(artifacts.every(Boolean)).toBe(true)
  return artifacts as FontArtifact[]
}

async function expectManifestSelection(page: Page, artifacts: FontArtifact[]) {
  const expected = expectedArtifacts(await renderedChironCodePoints(page))
  expect(artifacts.map(({ file }) => file).sort()).toEqual(expected.map(({ file }) => file).sort())
}

test('首頁只請求 schema-v2 core 並使用 immutable 同源快取', async ({ page, request }) => {
  const fontRequests = await loadWithFontRequests(page, '/')
  const artifacts = requestedArtifacts(fontRequests)

  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    'Chiron Sung HK'
  )
  expect(fontRequests.length).toBeLessThanOrEqual(2)
  expect(artifacts.map(({ role }) => role)).toEqual(['core'])
  expect(artifacts[0].bytes).toBe(coreBytes)
  expect(artifacts.reduce((bytes, artifact) => bytes + artifact.bytes, 0)).toBeLessThanOrEqual(
    homeBudget
  )
  await expectManifestSelection(page, artifacts)

  const response = await request.get(new URL(fontRequests[0]).pathname)
  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})

for (const article of [
  {
    label: '代表文章',
    path: '/2026/07/14/kamiina-botan-anime-review/',
  },
  {
    label: '目前最差 cryosleep 文章',
    path: '/2026/07/13/cryosleep-hodl-economy/',
  },
]) {
  test(`${article.label} 依 DOM code point 選片且維持可變字重`, async ({ page }) => {
    const fontRequests = await loadWithFontRequests(page, article.path)

    await page.locator('article').evaluate((element) => {
      for (const weight of [400, 550, 700]) {
        const probe = document.createElement('span')
        probe.dataset.fontWeightProbe = String(weight)
        probe.style.fontWeight = String(weight)
        probe.textContent = '字型'
        element.append(probe)
      }
    })
    await page.evaluate(() => document.fonts.ready)

    const families = await page.locator('[data-font-weight-probe]').evaluateAll((elements) =>
      elements.map((element) => ({
        weight: getComputedStyle(element).fontWeight,
        family: getComputedStyle(element).fontFamily,
      }))
    )
    expect(families.map(({ weight }) => weight)).toEqual(['400', '550', '700'])
    expect(families.every(({ family }) => family.includes('Chiron Sung HK'))).toBe(true)

    const artifacts = requestedArtifacts(fontRequests)
    expect(fontRequests.length).toBeLessThanOrEqual(articleRequestBudget)
    expect(artifacts.reduce((bytes, artifact) => bytes + artifact.bytes, 0)).toBeLessThanOrEqual(
      articleBudget
    )
    await expectManifestSelection(page, artifacts)
  })
}

test('Serwist install 不會 eager fetch 全部 Chiron WOFF2', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  const installRequests = new Set<string>()

  context.on('request', (request) => {
    if (request.serviceWorker()) installRequests.add(new URL(request.url()).pathname)
  })

  await page.goto('/')
  await page.evaluate(async () => void (await navigator.serviceWorker.ready))
  await page.waitForTimeout(500)

  expect(installRequests).toContain('/offline/')
  expect([...installRequests].filter((path) => path.startsWith(fontPath))).toEqual([])
  await context.close()
})
