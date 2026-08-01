import { expect, test, type Locator, type Page } from '@playwright/test'

// 隱藏文章可用直接 URL 路由到(只是不列在清單),含多種圖種,適合當夾具。
const mermaidPath = '/2025/08/29/mermaid-v10-test/'

test('mermaid 圖表隨客戶端主題切換而切換(深色→淺色)', async ({ page }) => {
  await page.goto(mermaidPath)

  const figure = page.locator('.mermaid-figure').first()
  await expect(figure).toBeVisible()

  const light = figure.locator('.mermaid-light')
  const dark = figure.locator('.mermaid-dark')

  // 本站預設深色(siteMetadata.theme = 'dark'):初始應顯示深色 SVG。
  await expect(dark).toBeVisible()
  await expect(light).toBeHidden()

  // 透過 ThemeSwitch 切成 Light。
  // 注意:選單項底層雖是 <button>,但 HeadlessUI 的 MenuItem 賦予的可及性角色是
  // menuitem(非 button)——用 getByRole('button', { name: 'Light' }) 會找不到,
  // 曾在此踩過雷(30s timeout),見 page snapshot 印證後改用 menuitem。
  await page.getByRole('button', { name: 'Theme switcher' }).click()
  await page.getByRole('menuitem', { name: 'Light' }).click()

  // 切換後應即時改顯示淺色 SVG,不需重載。
  await expect(light).toBeVisible()
  await expect(dark).toBeHidden()
})

test('寬圖在手機寬度下可水平捲動,不被壓縮', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(mermaidPath)

  // 找第一個「圖比容器寬」的 figure(甘特圖/序列圖通常較寬)。
  const overflowing = await page
    .locator('.mermaid-figure')
    .evaluateAll((figures) => figures.some((f) => f.scrollWidth > f.clientWidth + 1))
  expect(overflowing).toBe(true)
})

// 2026-07-25:一張含多行標籤(`<br/>`)的圖上了 production 卻塌成一條細線。mermaid 把
// `<br/>` 序列化成裸 `<br>`,而 `<img>` 載入的 SVG 走嚴格 XML 解析,一個裸 void element
// 就讓整份文件解析失敗 —— 請求仍是 200、沒有 console 錯誤、`mermaid-check` 的 hash 比對
// 也綠燈,唯一的外顯症狀就是 naturalWidth/Height 變 0。這裡直接盯那個症狀,不管成因。
// 多行標籤只出現在 OpenWiki 那篇,所以兩個 fixture 都要跑:測試文涵蓋各種圖種,
// OpenWiki 那篇涵蓋 `<br/>` 標籤。
for (const [label, urlPath] of [
  ['各圖種測試文', mermaidPath],
  ['含多行標籤的文章', '/2026/07/25/openwiki-tame-agents-md/'],
] as const) {
  test(`${label}的每張 mermaid SVG 都有固有尺寸(擋 XML 解析失敗造成的靜默塌陷)`, async ({
    page,
  }) => {
    await page.goto(urlPath)
    await expect(page.locator('.mermaid-figure').first()).toBeVisible()

    const broken = await page.locator('.mermaid-figure img').evaluateAll(async (nodes) => {
      const images = nodes.filter(
        (node): node is HTMLImageElement => getComputedStyle(node).display !== 'none'
      )
      // 圖多半在首屏外,loading="lazy" 會讓它們根本沒開始載入,量到的 0 會是假陽性。
      images.forEach((image) => {
        image.loading = 'eager'
      })
      await Promise.all(
        images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true })
                image.addEventListener('error', resolve, { once: true })
              })
        )
      )
      return images
        .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
        .map((image) => image.getAttribute('src'))
    })

    expect(broken, `這些 SVG 沒有固有尺寸(很可能不是合法 XML):${broken.join(', ')}`).toEqual([])
  })
}

async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

async function measure(image: Locator) {
  return image.evaluate((node) => {
    const img = node as HTMLImageElement
    const rect = img.getBoundingClientRect()
    const sentinel = document.querySelector('[data-mermaid-sentinel]') as HTMLElement
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      widthAttribute: img.getAttribute('width'),
      heightAttribute: img.getAttribute('height'),
      rect: { width: rect.width, height: rect.height },
      // 加上 scrollY 換算成文件絕對座標:版位變動可能連帶改變捲動位置,
      // 只用 viewport 相對座標會把兩種效應混在一起。
      sentinelTop: sentinel.getBoundingClientRect().top + window.scrollY,
    }
  })
}

// 2026-08-01:<img> 原本只帶 class/src/alt/loading,而 CSS 是 max-width:none + height:auto
// 且沒有 width —— SVG 抵達前完全不保留版位。尺寸其實一直都在 committed SVG 的根標籤上。
//
// 這個測試把 SVG 回應「閘住」,在資源尚未送達的那一刻量版位,再放行量第二次。
// 三組斷言各守不同鏈結,缺一不可(每一組都有其他組抓不到的突變,見設計文件的突變矩陣)。
test('SVG 抵達前就保留正確版位', async ({ browser, baseURL }) => {
  // 站台的 service worker 對 .svg 掛 StaleWhileRevalidate,而 Playwright 預設
  // serviceWorkers: 'allow' —— 不 block 的話量到的是 SW 快取行為而不是 markup,
  // 且 SW claim client 與首次影像請求是競態,會得到時好時壞的結果。
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
  try {
    let release!: () => void
    const responseGate = new Promise<void>((resolve) => {
      release = resolve
    })
    let seen!: () => void
    const requestSeen = new Promise<void>((resolve) => {
      seen = resolve
    })

    await context.route('**/mermaid/*.svg', async (route) => {
      seen()
      await responseGate
      await route.continue()
    })

    const page = await context.newPage()
    await page.goto(mermaidPath, { waitUntil: 'domcontentloaded' })

    const figure = page.locator('.mermaid-figure').first()

    // 不能用 :visible 選變體 —— Playwright 的可見性要求寬高皆 > 0,零高度元素
    // 會讓 locator 直接找不到,把「版位退化成零」偽裝成「元素不存在」。
    const shownIndex = await figure
      .locator('img')
      .evaluateAll((nodes) => nodes.findIndex((n) => getComputedStyle(n).display !== 'none'))
    expect(shownIndex).toBeGreaterThanOrEqual(0)
    const image = figure.locator('img').nth(shownIndex)

    // 保留 production 的 lazy 行為,不改成 eager。
    expect(await image.getAttribute('loading')).toBe('lazy')

    await figure.evaluate((node) => {
      // 捲動目標必須是獨立的 1×1 元素,不能是圖片本身 —— 否則「移除 height 屬性」
      // 的突變會讓 lazy 觸發失效,測試變成因為別的原因紅。
      const scrollTarget = document.createElement('span')
      scrollTarget.style.cssText = 'display:block;width:1px;height:1px'
      node.prepend(scrollTarget)
      const downstream = document.createElement('div')
      downstream.dataset.mermaidSentinel = ''
      node.after(downstream)
      scrollTarget.scrollIntoView({ behavior: 'instant', block: 'center' })
    })

    await requestSeen
    await settle(page)
    const before = await measure(image)

    // 正控制:證明閘門真的擋著。少了這條,before 量到的其實是 after,
    // 整組斷言會無聲空轉通過。
    expect(before.naturalWidth).toBe(0)
    expect(before.naturalHeight).toBe(0)

    // A 組:版位有沒有被保留
    expect(before.widthAttribute).not.toBeNull()
    expect(before.heightAttribute).not.toBeNull()
    expect(before.rect.height).toBeGreaterThan(0)
    expect(before.rect.height).toBeCloseTo(
      before.rect.width * (Number(before.heightAttribute) / Number(before.widthAttribute)),
      1
    )

    release()
    await image.evaluate((node) => (node as HTMLImageElement).decode())
    await settle(page)
    const after = await measure(image)

    // 容差 2px 是刻意的,不是隨手挑的數字。HTML 屬性只能是整數而 SVG 的固有尺寸是小數,
    // 所以載入後改用真實比例時必然有次像素更新:實測這張圖是 0.7px(333 × 470/332.5 − 470),
    // 現有 20 個產物的最壞情況約 0.889px。取 1px 只剩 0.11px 餘裕,會變成隨機假紅。
    //
    // 放寬後 A 組就抓不到「兩軸同時 ×2」了(等比縮放的殘留仍在容差內),那本來就該由
    // B 組結構性地抓 —— A 組守「有沒有保留形狀對的版位」,B 組守「絕對尺寸對不對」。
    expect(Math.abs(after.rect.height - before.rect.height)).toBeLessThan(2)
    expect(Math.abs(after.sentinelTop - before.sentinelTop)).toBeLessThan(2)

    // B 組:保留的版位是不是對的絕對尺寸。單獨守不住 height="1"(A 組負責),
    // 但 A 組守不住 width/height 同時 ×2 —— 那會比例自洽、前後一致,圖卻被放大兩倍。
    expect(after.naturalWidth).toBeGreaterThan(0)
    expect(Math.abs(after.naturalWidth - Number(before.widthAttribute))).toBeLessThanOrEqual(1)
    expect(Math.abs(after.naturalHeight - Number(before.heightAttribute))).toBeLessThanOrEqual(1)

    // C 組:產物自己的尺寸契約。B 組守不住「normalizeSvg 把 root 寫成 2W×2H」——
    // 那時 naturalWidth 也是 2W,與屬性一致。這裡錨到 viewBox 才切得開。
    // 注意這不是 SVG 的普遍規則(root viewport 與 viewBox 允許不同尺度),
    // 守的是 normalizeSvg 明確選定的契約:root 尺寸 = viewBox extent。
    const resource = await image.evaluate(async (node) => {
      const text = await fetch((node as HTMLImageElement).currentSrc).then((r) => r.text())
      const root = new DOMParser().parseFromString(text, 'image/svg+xml')
        .documentElement as unknown as SVGSVGElement
      return {
        rootWidth: root.width.baseVal.value,
        rootHeight: root.height.baseVal.value,
        viewBoxWidth: root.viewBox.baseVal.width,
        viewBoxHeight: root.viewBox.baseVal.height,
      }
    })
    expect(resource.rootWidth).toBeCloseTo(resource.viewBoxWidth, 6)
    expect(resource.rootHeight).toBeCloseTo(resource.viewBoxHeight, 6)
    expect(Number(before.widthAttribute)).toBe(Math.round(resource.viewBoxWidth))
    expect(Number(before.heightAttribute)).toBe(Math.round(resource.viewBoxHeight))
  } finally {
    await context.close()
  }
})
