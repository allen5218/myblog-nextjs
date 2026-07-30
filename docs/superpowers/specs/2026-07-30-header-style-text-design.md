# 文章純文字 hero(`headerStyle: text`)設計

## 背景

Hux 原始主題支援 `header-style: text`:文章 hero 不放底圖、不放漸層、不放遮罩,標題與
metadata 直接落在頁面底色上。參考頁 <https://huangxuan.me/2020/07/05/reflection-2020/>。

從該頁的 HTML 與 `https://huangxuan.me/css/hux-blog.min.css` 取得權威實作,總共只動兩個地方
—— **第二個(導覽列)極容易漏**:

```html
<header class="intro-header style-text">
<nav class="navbar navbar-default navbar-custom navbar-fixed-top invert">
```

```css
.intro-header.style-text{background:0 0}
.intro-header.style-text .post-heading{padding:85px 0 20px;color:#404040}
.intro-header.style-text .post-heading .subheading{margin-bottom:15px}
.intro-header.style-text .tags .tag{border-color:#404040;color:#404040}
.intro-header.style-text .tags .tag:hover{background-color:rgba(0,0,0,.05)}
.navbar-custom.invert .navbar-brand{color:#404040}
.navbar-custom.invert .nav li a{color:#404040}
.navbar-custom.invert .navbar-toggle .icon-bar{background-color:#404040}
```

Hux 的 `padding: 85px 0 20px` 具權重 (0,3,0),壓過桌面的 `150px` (0,2,0),所以
**text 模式在所有斷點都是 85/20**,桌面不會撐到 150px。

`#404040` 恰好等於本專案 `--hux-text` 的淺色值 `rgb(64, 64, 64)`。

## 根因:8 個色值常數編碼同一個即將失效的不變量

hero 現有的所有顏色常數如下,**它們全部在編碼同一個事實:「hero 背景永遠是深色」**:

| `css/tailwind.css` | 宣告 |
| --- | --- |
| 334 | `.intro-header { color: #fff }` |
| 422 | `.intro-header-post .series-meta a:hover { color: #66c7e0 }` |
| 427 | `.site-heading h1 { color: #fff }` |
| 436 | `.site-heading .subheading { color: #fff }` |
| 450 | `.post-heading h1 { color: #fff }` |
| 458 | `.post-heading .subheading { color: #fff }` |
| 470 | `.post-heading .meta, .post-heading .series-meta { color: #fff }` |
| 489 | `.tags .tag { border: 1px solid rgba(255, 255, 255, 0.8) }` |

`headerStyle: text` 是**第一個讓這個不變量變成假的東西**。導覽列同樣有六處
(217/235/243/259/286/301),編碼同一個假設。

因此變數化不是「順手重構」:窄改法會產生 8 個原常數 + 約 7 條平行覆寫 = 15 個必須手動保持
同步的地方,兩種模式可以無聲漂移。變數法讓 text 模式縮成 3 行賦值。

第 422 行的 `#66c7e0` 特別值得記錄:**它就是 `--series-interactive` 的深色主題值**,被釘死是
因為「hero 永遠是深色照片」。目前需要 `CLAUDE.md` 四段文字加
`tests/playwright/series.spec.ts:144-159` 的註解才能解釋它為何存在。

### CSS 變數在此的關鍵性質

自訂屬性**不參與 specificity 競賽** —— 它在「賦值點」解析,靠繼承傳播。所以變數化讓一整類
「必須用兩個 class 否則跟既有規則平手、輸在原始碼順序」的權重陷阱**直接消失**。

## 目標

1. 文章 frontmatter 支援 `headerStyle: text`,啟用無底圖/無漸層/無遮罩的 hero。
2. 淺色與深色主題**都**正確且通過 WCAG AA(對比 ≥ 4.5),含導覽列與手機版。
3. 逐值複製 Hux 的淺色外觀(`--hux-text` 淺色值即 `#404040`)。
4. 消除上述 14 個色值常數所編碼的失效假設,使未來新增 hero/導覽列元素只需讀一個變數。

## 非目標

- 不支援 `.site-heading` / `.page-heading` 的 text 模式(Hux 的 CSS 有,但本站首頁、archive、
  series、about、404、offline 全部寫死 `headerImg`,沒有需求)。
- 不改 `layout: PostSimple` / `PostBanner`(它們不渲染 `HuxHero`,見「已知未處理問題」)。
- 不套用到任何既有真實文章(本次只加能力 + hidden fixture)。
- 不修 `components/SearchButton.tsx` 的死 Tailwind 類別(已另開獨立任務)。
- 不動 `Header.tsx` 的捲動 JS。

## 與既有設計的關係

`docs/superpowers/specs/2026-07-10-post-hero-nav-parity-design.md` 建立了兩項本設計必須遵守的
前提:

- **「用針對性 CSS parity 規則,而不是重寫 React 導覽列 markup」** —— 支持本設計選 CSS `:has()`
  而非 React context плumbing。
- 該 spec 恢復了手機 hero 的「內容驅動高度」與原始垂直 padding。本設計的 85/20 padding **只
  套在 `.intro-header-text`**,圖片文章的幾何完全不動;`article-width.spec.ts` 與 parity 測試
  必須維持全綠。

## 架構

### 1. 資料層:`contentlayer.config.ts`

加在 `headerMask` 旁邊:

```ts
headerStyle: { type: 'enum', options: ['text'] },
```

`enum` 經確認是 contentlayer2 有效型別(`@contentlayer2/source-files/dist/schema/defs/field.d.ts:113`)。

**這是本 repo 第一個 `enum` 欄位** —— 連值域更明確的 `layout` 都是 `type: 'string'` + 執行期
回退。這帶來一個**全新的失敗模式**:`headerStyle: txt` 會讓 `yarn contentlayer2 build`(進而
`tsc --noEmit`)直接失敗,而不是像 `layout` 打錯字那樣靜默回退。這是刻意選擇的
fail-fast,已確認為期望行為。

computed fields **零改動**:`heroImage` 本來就是 `doc.headerImg || ''`;`structuredData.image`
落到 `siteMetadata.socialBanner`;OG 卡走 `selectSocialCardBackground` 既有的
`SOCIAL_CARD_FALLBACK` 漸層路徑。

### 2. `lib/hero-mode.ts` — hero 表面優先序純函式(新增)

沿用本 repo 既定慣例「hero 相關決策邏輯放 `lib/`、元件保持薄、配同名單元測試」:
`lib/iframe.ts` 的 `resolveHeroIframeSrc`(`HuxHero.tsx:6` 已在 import)+ `tests/unit/iframe.test.ts`;
`lib/social-card.ts` 的 `selectSocialCardBackground` + `tests/unit/social-card.test.ts`。
`HuxHero.tsx` 裡內聯的 `resolveHeaderImage` 與優先序三元是**例外,不是常態**。

```ts
export type HeroMode =
  | { kind: 'keynote'; iframeSrc: string }
  | { kind: 'text' }
  | { kind: 'gradient'; background: string }
  | { kind: 'image'; url: string }

export type HeroSurface = {
  mode: HeroMode
  maskOpacity: number | null // null = 不渲染 .header-mask
}

export function resolveHeroSurface(input: {
  headerStyle?: string
  iframe?: string
  headerImg?: string
  headerBgCss?: string
  headerMask?: unknown
}): HeroSurface
```

優先序:**keynote > text > gradient > image**。

- `keynote` 優先於 `text`:沿用 `HuxHero.tsx:52` 既有的 `hasIframe` 短路排在最前面的先例。
- `text` 必須**先於** `headerBgCss` 判斷。遷移內容常殘留舊 frontmatter 欄位;若寫成
  `cleanedBgCss ? ... : isText ? ...`,`headerStyle: text` + 殘留 `headerBgCss` 會讓漸層透出來。
- `gradient` 沿用既有的尾隨分號清理(`HuxHero.tsx:46-50` 記錄的 SPA 導覽 bug),該修復
  **目前只有註解保護、沒有任何測試** —— 本次補上。
- `image` 沿用 `resolveHeaderImage` 的 `/img/home-bg.avif` fallback。

**遮罩的等值約束(重要)**:commit 1 必須是零行為改變,所以 `resolveHeroSurface` 第一版要
**完全複製現況** —— 只要 `headerMask` 是有效數字就回傳該值,**不分模式**(現況 keynote +
`headerMask` 也會渲染遮罩)。「text 模式抑制遮罩」是行為改變,放到 commit 5 才加,並在單元
測試裡明確斷言這個轉變。

### 3. hero 色值變數化(`css/tailwind.css`)

```css
.intro-header {
  --hero-fg: #fff;
  --hero-border: rgba(255, 255, 255, 0.8);
  --hero-link-hover: #66c7e0;
}
```

上表 8 處改讀對應變數。`.tags .tag` 的 `color: inherit`(491 行)會自動跟著 `--hero-fg`,
**但 489 行的 `border` 不會被 `inherit` 帶到**,必須獨立改讀 `--hero-border`。漏掉這條會在
淺色主題的 text 模式出現「白色細框飄在白底上」。

### 4. navbar 色值變數化(`css/tailwind.css`)

```css
.navbar-custom {
  --navbar-fg: #fff;
  --navbar-fg-hover: rgba(255, 255, 255, 0.8);
  --navbar-bg: transparent;
}
.navbar-custom.is-fixed {
  --navbar-fg: #2d2d2d;
  --navbar-bg: rgba(255, 255, 255, 0.9);
}
.dark .navbar-custom.is-fixed {
  --navbar-fg: #fff;
  --navbar-bg: rgba(45, 45, 45, 0.9);
}
```

改讀變數的六處:217(根 `color`)、235(`.navbar-brand`)、243(hover)、259(`.icon-bar`,
注意是 **`background`** 不是 `color`)、286(`.navbar-links a`、`.navbar-tools button`)、
301(`.navbar-tools svg`)。

`--navbar-fg` / `--navbar-fg-hover` 是功能必需;`--navbar-bg` 讓 `.dark .navbar-custom.is-fixed`
收斂成純變數賦值,是本次刻意授權的維護性簡化。

**刻意不做 `--navbar-border`。** 基底 `.navbar-custom` 目前**沒有** border 宣告,`border-bottom`
只存在於 `is-fixed`(1560 行)與其深色變體(1586 行,只覆寫顏色)。若為了對稱而在基底加
`border-bottom: 1px solid var(--navbar-border)` 並預設 transparent,**會憑空多出 1px 高度**,
違反「零像素變動」;而既有的深色覆寫本來就只有一行顏色,變數化零收益。

**這一項是第 6 項的前置依賴**,理由見下節手機版。

### 5. text 模式 CSS

```css
.intro-header-text {
  background: none; /* shorthand 會把 background-color 一併重置為 transparent,
                       清掉 .intro-header 的 #777(331 行) */
  --hero-fg: var(--hux-text);
  --hero-border: var(--hux-text);
  --hero-link-hover: var(--series-interactive);
}

/* Hux 的 style-text 在所有斷點都是 85/20,不套桌面的 150px。padding 不是變數,
   仍需權重:寫成單一 class 會跟桌面規則 .intro-header-post .intro-header-content
   (0,2,0,1597 行)平手而輸在原始碼順序。 */
.intro-header-post.intro-header-text .intro-header-content {
  padding: 85px 15px 20px;
}

.intro-header-text .tags .tag:hover {
  background-color: rgba(0, 0, 0, 0.05);
}
.dark .intro-header-text .tags .tag:hover {
  background-color: rgba(255, 255, 255, 0.08);
}
```

**tag hover 必須有深色變體。** Hux 的 `rgba(0,0,0,.05)` 是淺色專用值;在深色模式往
`rgb(45,45,45)` 疊 5% 黑會**更暗**,hover 回饋消失。本 repo 既有慣例正是為 hover 底色寫深色
變體(`.dark #tag_cloud .tag:hover`,715 行)。

`--hero-link-hover` 在 text 模式改吃 `--series-interactive` 是**唯一一處需要因主題而不同值**
的顏色。其餘變數在 text 模式都是「單一新值蓋單一舊值」。實測對比(WCAG 公式,對實際底色):

| 顏色 | 淺色底(白) | 深色底(`#2d2d2d`) | 判定 |
| --- | --- | --- | --- |
| `--hux-text` | 10.36 | 10.43 | 通過 |
| `#66c7e0`(原釘死值) | **1.94** | 7.08 | 淺色主題不合格 |
| `--series-interactive` | 6.49 | 7.08 | 通過 |
| `#0085a1`(Hux invert hover) | **4.31** | **3.19** | 兩者皆不合格,不採用 |

### 6. 導覽列 `:has()`(`css/tailwind.css`)

```css
body:has(.intro-header-text) .navbar-custom:not(.is-fixed) {
  --navbar-fg: var(--hux-text);
  --navbar-fg-hover: var(--series-interactive);
}
```

`<Header />`(`app/layout.tsx:105`)與 `<main>{children}</main>` 是**兄弟節點**,拿不到
frontmatter。資訊在下、需求在上,React 單向資料流沒有任何 prop 路徑可走。`:has()` 讓瀏覽器
做這個反向查詢,純宣告式:DOM 一變樣式立刻跟著變,無 effect、無時序、無殘留狀態。

**`:not(.is-fixed)` 是必要的,不是裝飾。** `:has()` 的權重等於其參數最高權重,整條
`body:has(.intro-header-text) .navbar-custom:not(.is-fixed) .navbar-brand` 是 **(0,4,1)**,會壓過
既有 `.navbar-custom.is-fixed .navbar-brand` (0,3,0)。加 `:not()` 讓兩者以 class 互斥 —— 比
「賭權重較大」穩健,捲動行為一個位元都不動。

**手機版是本設計最大的洞,而且需要新寫、不是鏡射既有規則。**
`.navbar-custom.is-fixed` 整組規則都在 `@media (min-width: 768px)`(1485 行)內
(`Header.tsx:22` 的註解已明載「行動版加上 class 也不生效」)。手機的 `.navbar-custom` 是
`position: absolute`,一捲動就跟 hero 一起被推出視窗 —— 白字能看見**純粹因為它疊在深色照片
上,沒有任何機制在適配底色**。所以 text 模式在手機淺色主題下,品牌字、`.icon-bar` 三條線、
ThemeSwitch 的 SVG(`fill="currentColor"`,顏色來自**沒有媒體查詢限制**的 301 行)全部會是
白色疊白底而消失。

上面那條規則之所以能一次涵蓋手機與桌面、不必放進任何 media query,**正是因為第 4 項先把所有
前景色收斂成 `--navbar-fg`**。這是第 4 項不能被跳過的直接證據。

## Cascade layer 硬性約束

`css/tailwind.css` 的分層:`@import 'tailwindcss'`(1 行)、`@layer base`(63)、
`@layer utilities`(104,約 141 行結束),**其後全部未分層** —— 包含所有 navbar 與 hero 規則。

Tailwind v4 把工具類放進 layer,而 **未分層作者樣式無條件贏過任何 `@layer` 內規則,與
specificity 無關**。因此:

- 本設計所有新規則(變數賦值、`:has()`)**必須留在未分層區**。包進 `@layer components` 會被
  任何 Tailwind 工具類蓋掉,失敗模式極隱晦:DevTools 看得到規則且未被劃掉,是輸在 layer
  順位而非權重,除錯路徑完全不同。
- **不要**把 `.navbar-tools svg`(301 行)搬進任何 `@layer`。它目前靜默蓋掉
  `SearchButton.tsx:24` 的 `text-gray-900 dark:text-gray-100`;搬層會讓那批死類別突然復活,
  產生原因不在改動行內的顏色異常。
- 推論:前面各節算的所有 specificity 元組,**只在「同層」前提下有意義**。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `contentlayer.config.ts` | 加 `headerStyle` enum 欄位 |
| `lib/hero-mode.ts` | 新增 |
| `components/hux/HuxHero.tsx` | 改用 `resolveHeroSurface`;加 `intro-header-text` class;text 模式不產生 inline `style`、不渲染遮罩 |
| `layouts/PostLayout.tsx` | 多解 `headerStyle` 並傳給 `HuxHero` |
| `css/tailwind.css` | 變數化 + text 模式 + `:has()` |
| `data/blog/hidden/2026-07-30-header-style-text-test.md` | 新增(全 ASCII) |
| `tests/unit/hero-mode.test.ts` | 新增 |
| `tests/playwright/header-style-text.spec.ts` | 新增 |
| `tests/playwright/helpers/theme.ts` | 新增:把 `setTheme` / `contrastRatio` / `colorsFor`(`series.spec.ts:20-38`)抽成共用。現在有兩個使用者,故抽出;`series.spec.ts` 改為 import 後**必須維持全綠且行為不變** |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都加 `headerStyle` |
| `README.md` | 功能清單 |
| `CLAUDE.md` / `AGENTS.md` | 新教訓 |

**inline style 是不可繞過的約束**:`HuxHero.tsx:52-59` 把背景寫成 inline `style`,inline 贏過
任何 class 規則。純 CSS **蓋不掉** `backgroundImage` 的 `home-bg.avif` fallback,所以 text 模式
必須讓元件根本不產生 `style`。

`next-env.d.ts` 一律排除,commit 時用明確的 `git add <檔案清單>`。

## 測試與驗收

### Unit(`tests/unit/hero-mode.test.ts`)

窮舉 `iframe × headerStyle × headerBgCss × headerImg` 組合表,比在瀏覽器裡試組合便宜得多:

- `iframe` + `text` → `keynote`(釘死優先序決定)
- `text` + `headerImg` → `text`
- `text` + `headerBgCss` → `text`(防「殘留 frontmatter 讓漸層透出」)
- `headerBgCss` 帶尾隨分號 → 清理後的值(補上目前只有註解保護的修復)
- 無 img 無 gradient → `image` + `/img/home-bg.avif`
- commit 1:遮罩行為與現況逐項相同(含 keynote + mask)
- commit 5:`text` 模式 `maskOpacity === null`

### Playwright(`tests/playwright/header-style-text.spec.ts`)

**主要不變量用「對比度」而非顏色字串。** 斷言「淺色時 h1 是 `rgb(64,64,64)`」既脆弱又是空包彈
溫床;改為量 `getComputedStyle` 的實際值後計算對比:

```ts
for (const theme of ['light', 'dark'] as const) {
  await setTheme(page, theme)
  const c = await colorsFor(target, background)
  expect(contrastRatio(c.foreground, c.background)).toBeGreaterThanOrEqual(4.5)
}
```

一條斷言形式涵蓋整個「在某個主題看不見」的 bug 類別。涵蓋清單(每項跑明/暗兩輪):hero h1、
subtitle、`Posted by` meta、tag 文字與邊框、tag hover 底色、導覽列品牌/連結/ThemeSwitch 文字/
搜尋 SVG、`.icon-bar`、系列連結靜止與 hover。

補上對比度抓不到的**關係型**斷言:

- text 文章 h1 色 `===` `body` 計算色;**對照組**:圖片文章 h1 `===` 白(證明斷言有鑑別力)
- 導覽列品牌色在 text 文章 `===` body 文字色、在圖片文章 `===` 白
- 主題切換前後同一元素顏色**必須不同**(證明真的吃變數,不是抄了 Hux 硬值)
- text 文章 hero `background-image` 為 `none`;圖片文章不為 `none`
- 桌面斷點 `.intro-header-content` 上下 padding 為 85/20 而非 150
- text 模式不渲染 `.header-mask`

視窗矩陣:mobile 375 / desktop 1280 × 明/暗 × 捲動前/捲動後。

**系列連結的已知測試限制**:`collectSeries`(`lib/series.ts:48`)會跳過 `listed === false`,所以
hidden fixture **無法**加入系列,該組合走不到真實內容路徑。改以「在真實系列文章頁上用 JS 注入
`intro-header-text` class」驗證該 CSS 規則,斷言「hover 對比 ≥ 4.5 **且兩主題不同色**」——
規則不存在時會退回 `#66c7e0`(淺色對比 1.94)而變紅,故非空包彈。測試內須註明這是合成 class、
不是真實內容路徑。

**反向不變量警告**:此處**不可**複製 `series.spec.ts:148-159` 的「兩主題 hover 同色」模式。
那條斷言的前提是「hero 永遠是深色照片、不隨主題翻轉」,text 模式打破了它。照抄會斷言一個
**錯誤的不變量**並綠燈通過 —— 與 `CLAUDE.md` 記錄的 #64/#65 同型空包彈。

### 突變測試矩陣(每條斷言都要做)

| 突變 | 應變紅的斷言 |
| --- | --- |
| 刪 `.dark ... .tag:hover` | 深色 tag hover 對比 |
| `--hero-link-hover` 改回 `#66c7e0` | 淺色系列連結 hover 對比 |
| 刪整條 `:has()` 規則 | 導覽列品牌色關係斷言(明/暗 + 手機/桌面) |
| `var(--hux-text)` 改成 `#404040` | 深色 h1 對比 + 「切換主題顏色要變」 |
| 拿掉 `:not(.is-fixed)` | 捲動後浮動列顏色 |
| 刪 `--hero-border` 覆寫 | 淺色 tag 邊框對比 |
| 元件不再短路 inline style | hero `background-image` 為 `none` |
| 覆寫降成單一 class | 桌面 padding 85/20 |

### production 目視驗收

`yarn build` → 綁 `127.0.0.1:3012`(**驗證後必須關閉該程序**)。CLAUDE.md 明令互動驗證不得用
dev server:冷路由首次點擊 ~1.5 秒是按需編譯。

- 兩主題 × mobile/desktop 截圖
- 兩個捲動狀態(頂端透明疊層、捲動後 `is-fixed`)
- 手機展開漢堡:三條線與下拉面板
- **在頁面上實際切換主題**(非重載),確認顏色即時跟著變
- 用 `getComputedStyle` 量實際值,不從 CSS 原始碼推論

### 字型預算

fixture 內容(標題、副標、tags、正文)**刻意全 ASCII**。`scripts/site-font-text.mjs:58` 的
`markdownFiles` 會遞迴進 `hidden/`,hidden 文章一樣計入預算;ASCII 全在 `PRINTABLE_ASCII` →
進 core → 新頁面碰桶數為 1,零新增 bucket、零產物重生成。完成後跑
`yarn check:site-font --full`(不帶 `--full` 會略過 shaping/cmap/axis 驗證,而 CI 跑的正是
`--full`)。

## Commit 序列(可二分)

嚴格區分「等值重構」與「行為改變」。前四步的驗收條件是**改了很多行、輸出零像素差異**,拿
既有測試組當守門員。

| # | 內容 | 驗收 |
| --- | --- | --- |
| 1 | `lib/hero-mode.ts` + 窮舉表單元測試 | 不碰 CSS;既有測試組全綠 |
| 2 | hero 色值變數化(含 489 行 tag 邊框) | 預設值全維持,**零像素變動** |
| 3 | hover 具名 slot,值仍為 `#66c7e0` | **零像素變動**(讓「值要不要吃主題」成為獨立可 review 的 diff) |
| 4 | navbar 色值變數化(含 `.icon-bar`、`is-fixed` 兩組收斂) | **零像素變動** |
| 5 | `enum` 欄位 + `PostLayout` 接線 + `.intro-header-text` CSS(接主題)+ 遮罩抑制 + 兩份手冊 | 第一個有新視覺行為的 commit |
| 6 | `:has()` 導覽列 + fixture + 雙主題 Playwright + 逐條突變測試 | 完整矩陣 |

任一「零像素變動」步驟出現位移就停手 —— 等值替換不等值。

**自檢**:第 6 步的 diff 若出現任何十六進位色碼,代表前面某步沒做乾淨,先停下檢查。

比對範圍:圖片文章、首頁、archive、series、about、404、offline(全部呼叫 `HuxHero` 且都寫死
`headerImg`,只要變數覆寫嚴格限定在 `.intro-header-text` class 上,這些路由視覺零變動)。

**不要改動 `tests/playwright/blog-parity.spec.ts:363` 釘死的那篇文章** —— 它是 service worker
跨網域 hero 圖快取測試,需要真實圖片。

## 已否決替代方案

- **`@supports not selector(:has(*))` 保險** —— 已否決。官方文件確認 Tailwind v4 最低要求
  Chrome 111 / Safari 16.4 / Firefox 128,而 `:has()` 支援起始為 Chrome 105 / Safari 15.4 /
  Firefox 121,**三者皆低於 Tailwind 門檻**(最窄的 Firefox 也是 128 > 121)。任何能渲染本站
  的瀏覽器都已支援 `:has()`,該分支永遠不會執行 —— 保護的是一組站台本來就已壞掉的瀏覽器。
  永遠不執行、只能靠造假才能驗證的分支比沒有分支更糟。
- **React Context + client state 傳遞 `headerStyle`** —— 已否決。首屏 SSR 時 context 為空,
  白字先渲染再翻深色(會閃);站內導覽依賴 effect 時序,有舊狀態殘留窗口。這正是
  `HuxHero.tsx:46-50` 記錄的「站內連結進來背景消失、重新整理才正常」同一類失敗模式。
- **把 `<Header />` 移出 root layout,各路由自行渲染並傳 prop** —— 已否決。能拿到完整 server 端
  正確性,但要動七條以上路由且導覽列從此重複。這不是簡化,是**增加**維護風險。
- **抽純函式只為可測性** —— 理由本身無效(`tests/unit/series-rendering.test.ts:36` 顯示
  `HuxHero` 早就能用 `renderToStaticMarkup` 測)。真正的理由是補齊 `lib/` + 同名單元測試的
  既有慣例,以及背景與遮罩兩個判斷的耦合需要一起決定。

## 已知未處理問題(刻意留下)

1. **`layout: PostSimple` / `PostBanner` 會靜默忽略 `headerStyle`。** 兩者不 import `HuxHero`
   (是 pliny 原生 Tailwind 版面,沒有 `.navbar-custom` 疊加問題),所以 `headerStyle: text` 只在
   `layout` 為預設或顯式 `PostLayout` 時有意義。不視為 bug,但**必須**在兩份手冊的 frontmatter
   表格寫明,否則日後排查會浪費時間。
2. **`SearchButton.tsx:24` 的 `text-gray-900 dark:text-gray-100` 是死碼**(被未分層的
   `.navbar-tools svg` 無條件蓋掉)。與本功能無關,已另開獨立任務,本次不折進來。
   `ThemeSwitch.tsx` 的圖示走同一條規則,需一併檢查。
3. **系列文 + text 模式沒有真實內容路徑的測試覆蓋**(hidden fixture 進不了系列),僅有合成
   class 注入的 CSS 規則測試。若日後有真實文章同時用系列與 text 模式,應補一條真實路徑測試。
4. **keynote(`iframe`)+ `headerMask` 會把遮罩渲染在 iframe 上**,可能阻擋點擊。此為既有行為,
   本次刻意保持不變(commit 1 必須零行為改變),未觀察到有文章使用該組合。
