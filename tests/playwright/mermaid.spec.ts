import { expect, test } from '@playwright/test'

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
