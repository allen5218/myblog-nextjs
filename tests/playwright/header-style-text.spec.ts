import { expect, test, type Page } from '@playwright/test'
import { contrastOf, contrastRatio, flattenLayers, parseColor } from '../helpers/color'
import { focusWithKeyboard } from '../helpers/focus'

const textPost = '/2026/07/31/header-style-text-test/'
const imagePost = '/2026/07/25/openwiki-tame-agents-md/'

/**
 * ⚠️ **必須在 goto 之後呼叫。** class 是設在當前文件的 <html> 上,導航會換掉整份文件。
 * 而且光靠 emulateMedia 不夠:siteMetadata.theme 是 'dark',next-themes 的 defaultTheme
 * 因此是明確值而不是 'system',新 profile 一律解析成深色 —— 兩輪都會變成在測深色,
 * 而「切換主題必須變色」那條會直接失敗。這也是 series.spec.ts 既有的呼叫順序。
 */
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page.locator('html').evaluate((html, value) => {
    html.classList.toggle('dark', value === 'dark')
  }, theme)
}

async function open(page: Page, path: string, theme: 'light' | 'dark') {
  await page.goto(path)
  await setTheme(page, theme)
}

const colorOf = (page: Page, selector: string, property = 'color') =>
  page
    .locator(selector)
    .first()
    .evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property)

/** 捲到指定位置並等待生效。前置斷言確保文件真的夠高,否則測試會靜默退化成 top 狀態。 */
async function scrollTo(page: Page, y: number) {
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  )
  expect(
    maxScroll,
    `fixture 不夠高(可捲 ${maxScroll}px),捲不到 ${y}px —— 測試會靜默退化成 top 狀態。請加 filler。`
  ).toBeGreaterThan(y + 100)

  // behavior: 'instant' 明確蓋掉全站的 html { scroll-behavior: smooth }(供錨點跳轉用)。
  // 少了這個,scrollTo 會沿著 easing 曲線緩降,waitForFunction 的 ±1px 容許值會在
  // 動畫途中(例如 6px)提前判定「到了」,讓後面對整數 scrollY 的嚴格斷言測不準。
  await page.evaluate((target) => window.scrollTo({ top: target, left: 0, behavior: 'instant' }), y)
  await page.waitForFunction((target) => Math.abs(window.scrollY - target) <= 1, y)
  // instant 跳轉後瀏覽器仍非同步派送 scroll 事件。Header.tsx 的 onScroll 監聽器要等事件
  // 真的跑過一輪才會更新 is-fixed/is-visible;background-to-back 呼叫 scrollTo 若不等這一拍,
  // 兩次 instant 跳轉可能被瀏覽器合併成同一輪派送,直接跳過中間閾值,is-fixed 永遠不會被加上。
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

// hero 內每個顏色 consumer 都要驗 —— 只驗 h1 正是 #64/#65 踩過的坑:
// 父層看似正確,child 的顏色與字重仍然漂移。
const HERO_CONSUMERS = [
  '.intro-header-text h1',
  '.intro-header-text .subheading',
  '.intro-header-text .meta',
]

// 導覽列的 consumer 同理。.icon-bar 讀的是 background 不是 color。
const NAVBAR_TEXT_CONSUMERS = ['.navbar-brand', '.navbar-links a']

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的每個 consumer 都等於 body 色,圖片文章則都是白色`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    const bodyColor = await colorOf(page, 'body')
    for (const selector of [...HERO_CONSUMERS, ...NAVBAR_TEXT_CONSUMERS]) {
      expect(await colorOf(page, selector), selector).toBe(bodyColor)
    }
    // ThemeSwitch 桌面是文字版,也必須跟著 token。
    expect(await colorOf(page, '.theme-switch-text')).toBe(bodyColor)
    expect(await colorOf(page, '.navbar-tool-trigger svg')).toBe(bodyColor)

    // 對照組:圖片文章的同一組 selector 必須是白色 —— 證明上面每一條都有鑑別力。
    // .theme-switch-text 與 .navbar-tool-trigger svg 也要在這裡驗證,否則把其中任一個
    // 硬編碼成 var(--hux-text) 時,整個 suite 仍然全綠,而圖片文章實際上會變成暗色壓在照片上。
    await open(page, imagePost, theme)
    for (const selector of [
      '.intro-header-post h1',
      '.intro-header-post .subheading',
      '.intro-header-post .meta',
      ...NAVBAR_TEXT_CONSUMERS,
      '.theme-switch-text',
      '.navbar-tool-trigger svg',
    ]) {
      expect(await colorOf(page, selector), selector).toBe('rgb(255, 255, 255)')
    }
  })

  test(`${theme}:手機的 .icon-bar 與 hero consumer 一樣跟著 token`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    const bodyColor = await colorOf(page, 'body')
    // .icon-bar 讀的是 background,漏掉它等於漏掉手機唯一的導覽視覺元素。
    expect(await colorOf(page, '.icon-bar', 'background-color')).toBe(bodyColor)
    for (const selector of HERO_CONSUMERS) {
      expect(await colorOf(page, selector), selector).toBe(bodyColor)
    }

    await open(page, imagePost, theme)
    expect(await colorOf(page, '.icon-bar', 'background-color')).toBe('rgb(255, 255, 255)')
  })

  test(`${theme}:text hero 沒有背景圖也沒有遮罩,桌面 padding 是 85/20`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    expect(await colorOf(page, '.intro-header-text', 'background-image')).toBe('none')
    // 這條專門釘住 shorthand 本身 —— `background: none` 同時歸零 background-image 與
    // background-color。只驗 background-image 抓不到把它誤改成 `background-image: none`
    // 的退化:那樣 background-color 就不再被重置,#777 底色會回到標題後面。
    expect(await colorOf(page, '.intro-header-text', 'background-color')).toBe('rgba(0, 0, 0, 0)')
    await expect(page.locator('.intro-header-text .header-mask')).toHaveCount(0)

    const content = page.locator('.intro-header-text .intro-header-content')
    expect(await content.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('85px')
    expect(await content.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('20px')

    // 對照組:圖片文章仍有背景圖,且桌面 padding 是 150。
    await open(page, imagePost, theme)
    expect(await colorOf(page, '.intro-header-post', 'background-image')).not.toBe('none')
    expect(
      await page
        .locator('.intro-header-post .intro-header-content')
        .evaluate((el) => getComputedStyle(el).paddingTop)
    ).toBe('150px')
  })
}

test('切換主題時 text hero 的顏色必須跟著變', async ({ page }) => {
  await open(page, textPost, 'light')
  const lightColor = await colorOf(page, '.intro-header-text h1')

  // 同一份文件上切換,不重新導航 —— 這才是使用者實際會做的事。
  await setTheme(page, 'dark')
  const darkColor = await colorOf(page, '.intro-header-text h1')

  // 抄了硬值(例如把 var(--hux-text) 改回 #404040)的話這條會紅。
  expect(darkColor).not.toBe(lightColor)
})

test('hero 外的 tag 邊框仍然完整 —— 不只是 border-color', async ({ page }) => {
  await page.goto('/')
  const tag = page.locator('.post-preview .tags .tag').first()
  await expect(tag).toBeVisible()

  const box = await tag.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      style: style.borderTopStyle,
      widths: [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ],
      color: style.borderTopColor,
      background: getComputedStyle(document.body).backgroundColor,
    }
  })

  // shorthand 失效時 border-color 仍生效、computed 值照樣有,只有 style 變 none、width 變 0。
  expect(box.style).not.toBe('none')
  for (const width of box.widths) expect(parseFloat(width)).toBeGreaterThan(0)
  // 非文字用 WCAG 1.4.11 的 3:1,不是 4.5。
  expect(contrastRatio(parseColor(box.color), parseColor(box.background))).toBeGreaterThanOrEqual(3)
})

// 沒有這條的話,commit B 新增的 `.intro-header .tags .tag { border-color: var(--hero-border) }`
// **完全沒有 oracle**:刪掉它之後淺色 text hero 的 tag 會退回全域 shorthand 的
// rgba(255,255,255,.8),白邊疊在白底上直接看不見,而既有測試(hero 外的 shorthand、
// tag hover 背景)全部照樣綠。
for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的 tag 邊框讀 --hero-border 且對底色可見`, async ({ page }) => {
    await open(page, textPost, theme)
    const tag = page.locator('.intro-header-text .tags .tag').first()
    await expect(tag).toBeVisible()

    const measured = await tag.evaluate((el) => ({
      borderColor: getComputedStyle(el).borderTopColor,
      heroBorder: getComputedStyle(el.closest('.intro-header') as HTMLElement)
        .getPropertyValue('--hero-border')
        .trim(),
      page: getComputedStyle(document.body).backgroundColor,
    }))

    expect(parseColor(measured.borderColor)).toEqual(parseColor(measured.heroBorder))
    // 非文字用 WCAG 1.4.11 的 3:1。
    expect(contrastOf(measured.borderColor, [measured.page])).toBeGreaterThanOrEqual(3)
  })

  // 對照組:image hero 的 tag 邊框必須仍是白色半透明,證明上一條測的是 text 專屬的賦值。
  test(`${theme}:image hero 的 tag 邊框仍是白色系`, async ({ page }) => {
    await open(page, imagePost, theme)
    const tag = page.locator('.intro-header-post .tags .tag').first()
    await expect(tag).toBeVisible()

    const borderColor = await tag.evaluate((el) => getComputedStyle(el).borderTopColor)
    const parsed = parseColor(borderColor)
    expect(parsed.r).toBeGreaterThan(200)
    expect(parsed.g).toBeGreaterThan(200)
    expect(parsed.b).toBeGreaterThan(200)
  })
}

test('text hero 的 tag hover:可讀性與方向性是兩個契約', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await open(page, textPost, theme)
    // 兩個主題共用同一個 page,座標又剛好落在同一顆 tag 上:上一輪 tag.hover() 留下的
    // 真實游標位置會在導航後被瀏覽器判定「已經停在新 tag 上」,直接套用 :hover ——
    // 沒有這行,第二輪量到的 resting 其實已經是 hover 態,兩輪比較永遠相等。
    await page.mouse.move(0, 0)
    const tag = page.locator('.intro-header-text .tags .tag').first()
    await expect(tag).toBeVisible()

    const read = () =>
      tag.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
      }))

    const resting = await read()
    await tag.hover()
    const hovered = await read()

    // 契約一:可讀性 —— 文字對合成後的有效背景。
    expect(contrastOf(hovered.color, [hovered.background, hovered.page])).toBeGreaterThanOrEqual(
      4.5
    )

    // 契約二:方向性 —— 合成後實際差異只有 1.12:1 / 1.29:1,本來就不該以 4.5 判定。
    const restingLuminance = flattenLayers([resting.background, resting.page])
    const hoveredLuminance = flattenLayers([hovered.background, hovered.page])
    if (theme === 'light') {
      expect(hoveredLuminance.r).toBeLessThan(restingLuminance.r)
    } else {
      expect(hoveredLuminance.r).toBeGreaterThan(restingLuminance.r)
    }
  }
})

// fixed 狀態的前景在兩個主題**不同**(淺 #2d2d2d / 深 #fff),所以兩輪都必須跑 ——
// 只跑 light 的話 .dark .navbar-custom.is-fixed 那組 token 被刪掉照樣全綠。
const FIXED_FOREGROUND = { light: 'rgb(45, 45, 45)', dark: 'rgb(255, 255, 255)' } as const
// 使用者核可頂欄 dropdown(ThemeSwitch + MobileNav)固定採 #3A839E + white 的視覺例外
// (約 4.27:1)。這個門檻只能用於這兩個 dropdown；其他文字控制仍維持 4.5:1。
const NAVBAR_APPROVED_DROPDOWN_TEXT_CONTRAST = 4.2

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:桌面 fixed-visible 前景正確,hover 完全不變色,popup 對比仍合格`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    // Header.tsx:向下捲且 scrollY > headerHeight(61) 才加 is-fixed;
    // 之後向上捲且 scrollY > 0 才加 is-visible。scrollY 一旦回到 0 就整組移除。
    await scrollTo(page, 500)
    await scrollTo(page, 400)
    await expect(page.locator('.navbar-custom.is-fixed.is-visible')).toBeVisible()

    const brand = page.locator('.navbar-brand')
    const resting = await brand.evaluate((el) => getComputedStyle(el).color)
    // fixed 有自己的實心底,所以 text tone 刻意**不**套用 —— 此時不等於 body 色。
    expect(resting).toBe(FIXED_FOREGROUND[theme])

    await brand.hover()
    // 直接斷言相等比「對比合格」強 —— 後者抓不到 #2d2d2d 漂到 #333。
    expect(await brand.evaluate((el) => getComputedStyle(el).color)).toBe(resting)

    // fixed 狀態下展開 popup:.navbar-custom.is-fixed .navbar-tools svg(0,3,1)原本
    // 壓過 [role='menu'] svg(0,2,1),補償規則在浮動狀態失效 —— 這是本 PR 要修的
    // 既有 cascade 問題,只在 top 狀態測 popup 抓不到它。
    // 桌面/手機各自常駐一份 ThemeSwitch(見 Header.tsx),兩者同時存在於 DOM、
    // 用 CSS 切換顯示 —— 這裡是桌面視窗,故 scope 到 .navbar-links 避免 strict mode 撞兩顆。
    await page.locator('.navbar-links .theme-switch-button').click()
    const item = page.locator('[role="menu"] button').first()
    await item.focus()
    const measured = await item.evaluate((el) => {
      const panel = el.closest('[role="menu"]') as HTMLElement
      return {
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
      }
    })
    expect(
      contrastOf(measured.color, [measured.background, measured.panel])
    ).toBeGreaterThanOrEqual(NAVBAR_APPROVED_DROPDOWN_TEXT_CONTRAST)
  })

  test(`${theme}:桌面 fixed-hidden 只驗 class 與位置,不做 hover(元素不可見)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    await scrollTo(page, 500)
    const navbar = page.locator('.navbar-custom')
    await expect(navbar).toHaveClass(/is-fixed/)
    await expect(navbar).not.toHaveClass(/is-visible/)
    // 藏在視窗上緣。hover() 在這個狀態會因不可見而失敗,那是環境問題不是顏色問題。
    expect(await navbar.evaluate((el) => getComputedStyle(el).top)).toBe('-61px')
  })

  test(`${theme}:桌面 top 的 hover 必須真的變色 —— 否則 consumer 不存在時 fixed 那條也會綠`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    const brand = page.locator('.navbar-brand')
    const resting = await brand.evaluate((el) => getComputedStyle(el).color)
    await brand.hover()
    expect(await brand.evaluate((el) => getComputedStyle(el).color)).not.toBe(resting)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:手機 near-top-with-is-fixed 導覽列仍套 text tone 且可讀`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    // 手機沒有 fixed 的視覺狀態(那組規則全在 min-width:768px 內),導覽列始終是
    // position:absolute 的透明疊層。這個狀態就是規範說的「捲回接近頂端」:
    // scrollY 僅數 px、導覽列已部分可見,而 is-fixed 尚未被移除(移除只發生在 scrollY === 0)。
    await scrollTo(page, 500)
    await scrollTo(page, 5)

    // 前置斷言:沒有這兩條的話,scrollY 被夾到 0 會讓 is-fixed 消失,
    // 測試就變成在測一般的 top 規則,@media (max-width:767px) 那條被刪掉也照樣綠。
    await expect(page.locator('.navbar-custom')).toHaveClass(/is-fixed/)
    expect(await page.evaluate(() => window.scrollY)).toBe(5)

    const measured = await page.locator('.navbar-brand').evaluate((el) => ({
      color: getComputedStyle(el).color,
      page: getComputedStyle(document.body).backgroundColor,
    }))
    expect(contrastOf(measured.color, [measured.page])).toBeGreaterThanOrEqual(4.5)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:桌面展開 ThemeSwitch 的 focus 態對比`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, textPost, theme)

    // 桌面/手機各自常駐一份 ThemeSwitch,scope 到 .navbar-links 避免 strict mode 撞兩顆。
    await page.locator('.navbar-links .theme-switch-button').click()
    const item = page.locator('[role="menu"] button').first()
    await item.focus()

    const measured = await item.evaluate((el) => {
      const panel = el.closest('[role="menu"]') as HTMLElement
      return {
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
      }
    })

    // 與 fixed-visible popup 共用同一個已核可的頂欄 dropdown 例外。
    expect(
      contrastOf(measured.color, [measured.background, measured.panel])
    ).toBeGreaterThanOrEqual(NAVBAR_APPROVED_DROPDOWN_TEXT_CONTRAST)
    // focus surface 對 panel(WCAG 1.4.11)—— 只量前者會漏掉「focus 指示器本身看不出來」。
    expect(contrastOf(measured.background, [measured.panel])).toBeGreaterThanOrEqual(3)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:手機漢堡的 Link 與 Search 在 hover、鍵盤 focus 都使用 control accent`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, textPost, theme)

    await page.locator('.navbar-toggle').click()
    // 一個 <a> 與 Search <button> 都要量；只守其中一種，另一個 focus 分支漂移仍會全綠。
    const targets = [
      page.locator('[role="menu"] a').first(),
      page.locator('[role="menu"] button', { hasText: 'Search' }),
    ]

    for (const target of targets) {
      await page.mouse.move(1, 700)
      await target.hover()
      const hovered = await target.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      }))
      expect(hovered).toEqual({
        color: 'rgb(255, 255, 255)',
        background: 'rgb(58, 131, 158)',
      })
    }

    // 先關閉選單、移走 mouse，再由鍵盤重新展開。HeadlessUI 的 menuitem 以
    // aria-activedescendant + data-focus 表達鍵盤 focus，DOM focus 留在 menu 容器上。
    await page.keyboard.press('Escape')
    await page.mouse.move(1, 700)
    const toggle = page.locator('.navbar-toggle')
    await focusWithKeyboard(page, toggle)
    await page.keyboard.press('Enter')

    // Enter 預設選中第一個 Link；End 則是真實鍵盤路徑移到最後一個 Search。
    for (const [target, key] of [
      [page.locator('[role="menu"] a').first(), undefined],
      [page.locator('[role="menu"] button', { hasText: 'Search' }), 'End'],
    ] as const) {
      if (key) await page.keyboard.press(key)
      await expect(target).toHaveAttribute('data-focus', '')
      const focused = await target.evaluate((el) => {
        const panel = el.closest('[role="menu"]') as HTMLElement
        return {
          color: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
          panel: getComputedStyle(panel).backgroundColor,
          hovered: el.matches(':hover'),
        }
      })
      expect(focused.hovered).toBe(false)
      expect(focused.color).toBe('rgb(255, 255, 255)')
      expect(focused.background).toBe('rgb(58, 131, 158)')
      expect(contrastOf(focused.color, [focused.background, focused.panel])).toBeGreaterThanOrEqual(
        NAVBAR_APPROVED_DROPDOWN_TEXT_CONTRAST
      )
      expect(contrastOf(focused.background, [focused.panel])).toBeGreaterThanOrEqual(3)
    }
  })
}

test('SPA 導覽:text → 圖片 → 上一頁,樣式都要跟著切換', async ({ page }) => {
  await page.goto(textPost)

  // full reload 時 URL 與樣式斷言一樣會通過,而 full reload 恰好繞過這條測試要驗的東西。
  await page.evaluate(() => {
    ;(window as unknown as { __spaMarker?: boolean }).__spaMarker = true
  })

  await page.locator('article .prose a[href^="/2026/"]').first().click()
  await page.waitForURL(imagePost)

  expect(
    await page.evaluate(() => (window as unknown as { __spaMarker?: boolean }).__spaMarker)
  ).toBe(true)
  expect(await colorOf(page, '.intro-header-post h1')).toBe('rgb(255, 255, 255)')
  expect(await colorOf(page, '.intro-header-post', 'background-image')).not.toBe('none')

  await page.goBack()
  await page.waitForURL(textPost)
  expect(await colorOf(page, '.intro-header-text', 'background-image')).toBe('none')
  expect(await colorOf(page, '.intro-header-text h1')).toBe(await colorOf(page, 'body'))
})

// ⚠️ 計算色相等**證明不了** utility 已被刪除:.navbar-tool-trigger svg 是未分層規則,
// 本來就會壓過 layered 的 text-gray-*,兩種寫法量到的顏色完全相同。要抓「元件留著
// 顏色 utility」這個突變,只能直接看 class list。
test('trigger 元件不得自帶顏色 utility', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, textPost, 'light')

  // ① 正面存在斷言。只用 `.navbar-tool-trigger` 當 locator 的話,漏加語意 class 的元件
  //    會直接從集合裡消失,測試反而更綠 —— 必須先釘住三個 trigger 都在。
  // ThemeSwitch 桌面/手機各常駐一份(Header.tsx 兩處都 render,靠 CSS 切換顯示),
  // 兩者同時在 DOM 裡,故 scope 到 .navbar-links 只釘桌面那顆,避免撞成 2 顆。
  await expect(page.locator('.navbar-links .theme-switch-button.navbar-tool-trigger')).toHaveCount(
    1
  )
  await expect(page.locator('.navbar-toggle.navbar-tool-trigger')).toHaveCount(1)
  // .navbar-search-tool 是外層 wrapper 的 class,SearchButton 本身只帶 .navbar-tool-trigger,
  // 兩者不在同一個元素上,所以是後代選擇器而非複合選擇器。
  await expect(page.locator('.navbar-search-tool .navbar-tool-trigger')).toHaveCount(1)

  // ② popup 內的 Sun/Moon/Monitor 圖示只有展開後才在 DOM 裡。關著的話 evaluateAll
  //    根本看不到它們,而那正是 text-gray utility 的所在地。
  await page.locator('.navbar-links .theme-switch-button').click()
  await expect(page.locator('[role="menu"]')).toBeVisible()

  // locator 刻意**不含** [role="menu"] button:那些按鈕的 text-gray-700! /
  // dark:text-gray-200! 是 popup 自己的契約,規範明訂保留。這裡只管 trigger 與圖示 ——
  // Sun/Moon/Monitor 三個圖示元件在 trigger 與 popup 兩處共用同一份 className。
  const classNames = await page
    .locator('.navbar-tool-trigger, .navbar-tool-trigger svg, [role="menu"] svg')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('class') ?? ''))

  expect(classNames.length).toBeGreaterThan(3)
  for (const className of classNames) {
    // ③ 任意前綴都要擋。實際存在的是 `group:hover:text-gray-100`,
    //    只寫 (dark:)?(hover:)? 的話抓不到 group: 這個前綴。
    expect(className, className).not.toMatch(/(^|\s)[\w:-]*text-gray-\d/)
    expect(className, className).not.toMatch(/(^|\s)[\w:-]*text-primary-\d/)
  }
})

test('trigger 的 SVG 顏色確實跟著 --navbar-fg', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, textPost, 'light')

  const svgColor = await colorOf(page, '.navbar-tool-trigger svg')
  const navbarFg = await page
    .locator('.navbar-custom')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--navbar-fg').trim())

  expect(parseColor(svgColor)).toEqual(parseColor(navbarFg))
})

// ── text hero 的 series 連結:CSS consumer harness ──────────────────────────
// hidden fixture 進不了系列(series 收集會跳過 listed === false),所以真實 text
// fixture 頁面上**沒有 .series-meta 元素**。注入同形元素補這一層。
//
// 注入位置必須是 .intro-header-text .post-heading 內 —— 放在 hero 任意位置的話
// 選擇器根本不匹配。class list 必須完整:省略 .post-series-link-top 會製造
// production 不存在的 cascade。
//
// oracle 分工:刪掉 hero 專屬 consumer **不會**讓這裡變紅(--hero-link-hover 就是
// --series-interactive,遞補後同值),那由既有的 image-series E2E 負責。
// 這個 harness 專門守「--hero-link-hover 沒被改回硬編碼 #66c7e0」——
// 那個值對淺色底的對比只有 1.94。
async function injectSeriesHarness(page: Page) {
  await page.locator('.intro-header-text .post-heading').evaluate((heading) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'post-series-link post-series-link-top series-meta'
    const link = document.createElement('a')
    link.href = '/series/harness/'
    link.textContent = 'harness series'
    wrapper.append(link)
    heading.append(wrapper)
  })
  return page.locator('.intro-header-text .series-meta a')
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}:text hero 的 series 連結 hover 可讀且真的變色`, async ({ page }) => {
    await open(page, textPost, theme)
    const link = await injectSeriesHarness(page)

    const read = () =>
      link.evaluate((el) => ({
        color: getComputedStyle(el).color,
        page: getComputedStyle(document.body).backgroundColor,
      }))

    const resting = await read()
    await link.hover()
    const hovered = await read()

    expect(hovered.color).not.toBe(resting.color)
    // 改回硬編碼 #66c7e0 的話,淺色這一輪會是 1.94。
    expect(contrastOf(hovered.color, [hovered.page])).toBeGreaterThanOrEqual(4.5)
  })

  test(`${theme}:text hero 的 series 連結 focus 可讀且真的變色`, async ({ page }) => {
    await open(page, textPost, theme)
    const link = await injectSeriesHarness(page)

    const resting = await link.evaluate((el) => getComputedStyle(el).color)
    // 必須是**真的鍵盤** focus。link.focus() 是程式化 focus,規則若哪天收緊成
    // :focus-visible,程式化 focus 不會觸發而測試會靜默失去鑑別力。
    // 規則同時宣告 hover 與 focus,只測 hover 的話刪掉 focus arm 照樣綠。
    await focusWithKeyboard(page, link)
    const focused = await link.evaluate((el) => ({
      color: getComputedStyle(el).color,
      page: getComputedStyle(document.body).backgroundColor,
    }))

    expect(focused.color).not.toBe(resting)
    expect(contrastOf(focused.color, [focused.page])).toBeGreaterThanOrEqual(4.5)
  })
}
