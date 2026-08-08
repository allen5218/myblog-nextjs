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
const coreBytes = manifest.artifacts.find((artifact) => artifact.role === 'core')!.bytes
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

// 數學文章會另外載入 KaTeX 自帶的字型。那是 Chiron 預算之外的獨立資源,但仍要把
// 「允許的同源非 Chiron 字型」限定在它身上,才不會讓別的字型悄悄溜進本站資源。
// 跨來源字型(留言區、影片嵌入等第三方 iframe)不在本測試範圍,由 CSP 管。
const katexFontPath = /^\/_next\/static\/media\/KaTeX_/

function chironRequests(fontRequests: string[], pageUrl: string) {
  const origin = new URL(pageUrl).origin
  const chiron: string[] = []
  for (const url of fontRequests) {
    const parsed = new URL(url)
    if (parsed.origin !== origin) continue
    if (parsed.pathname.startsWith(fontPath)) chiron.push(url)
    else expect(parsed.pathname).toMatch(katexFontPath)
  }
  return chiron
}

function requestedArtifacts(fontRequests: string[]) {
  expect(fontRequests.length).toBeGreaterThan(0)
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

// 每篇文章都要量。抽測代表文章會漏掉「渲染得出來、但 markdown 沒有」的字元
// (HuxPager 的 `←`/`→`、KaTeX 的 `×`/`−` 等)——那類遺漏只會打中特定文章,
// 而 check:site-font 的靜態模型只讀 markdown,永遠抓不到。
const articles = (
  JSON.parse(
    readFileSync(join(process.cwd(), '.contentlayer/generated/Blog/_index.json'), 'utf8')
  ) as { path: string; draft?: boolean }[]
)
  // production 抵達不了的文章沒有 <article> 可量。draft 的 404 由
  // publication-policy.spec.ts 負責;這裡的「不可抽測」原則仍然成立 ——
  // 涵蓋的是全部 production-reachable 文章,不是取樣。
  .filter((article) => article.draft !== true)
  .map(({ path }) => ({ label: path, path: `/${path}/` }))

for (const article of articles) {
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

    const chiron = chironRequests(fontRequests, page.url())
    const artifacts = requestedArtifacts(chiron)
    expect(chiron.length).toBeLessThanOrEqual(articleRequestBudget)
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
  // 離線後備頁的呈現依賴會預快取 core(必須真的抓,空集合不算過),
  // 但絕不 eager fetch supplemental buckets。
  const fontInstallRequests = [...installRequests].filter((path) => path.startsWith(fontPath))
  expect(fontInstallRequests.length).toBeGreaterThan(0)
  expect(fontInstallRequests.every((path) => path.includes('/core.'))).toBe(true)
  expect(fontInstallRequests.some((path) => path.includes('supplement-'))).toBe(false)
  await context.close()
})
