# 文章純文字 hero(`headerStyle: text`)設計

> 修訂 2:依 Codex 唯讀審查修正六個 blocker。原始 v1 的三處設計會破壞它自己承諾的「零行為
> 改變」(hero 外 tag 邊框消失、fixed navbar hover 變白底白字、image fallback 底色從
> `#2D2D2D` 退化成 `#777`),另有兩處測試設計會假綠。逐項驗證記錄見「審查修正記錄」。

## 背景

Hux 原始主題支援 `header-style: text`:文章 hero 不放底圖、不放漸層、不放遮罩,標題與
metadata 直接落在頁面底色上。參考頁 <https://huangxuan.me/2020/07/05/reflection-2020/>。

從該頁 HTML 與 `https://huangxuan.me/css/hux-blog.min.css` 取得權威實作,總共只動兩個地方
—— **第二個(導覽列)極容易漏**:

```html
<header class="intro-header style-text">
<nav class="navbar navbar-default navbar-custom navbar-fixed-top invert">
```

```css
.intro-header.style-text{background:0 0}
.intro-header.style-text .post-heading{padding:85px 0 20px;color:#404040}
.intro-header.style-text .tags .tag{border-color:#404040;color:#404040}
.intro-header.style-text .tags .tag:hover{background-color:rgba(0,0,0,.05)}
.navbar-custom.invert .navbar-brand{color:#404040}
.navbar-custom.invert .nav li a{color:#404040}
.navbar-custom.invert .navbar-toggle .icon-bar{background-color:#404040}
```

Hux 的 `padding: 85px 0 20px` 具權重 (0,3,0),壓過桌面的 `150px` (0,2,0),所以
**text 模式在所有斷點都是 85/20**。`#404040` 恰好等於本專案 `--hux-text` 的淺色值
`rgb(64, 64, 64)`。

## 根因:14 個色值常數編碼同一個即將失效的不變量

hero 現有顏色常數(8 個):

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

導覽列另有 6 個(217/235/243/259/286/301)。**14 個常數全部在編碼同一個事實:「hero 背景
永遠是深色」** —— `headerStyle: text` 是第一個讓它變成假的東西。

窄改法會產生 14 個原常數 + 平行覆寫,兩種模式可無聲漂移。變數法讓 text 模式縮成數行賦值。

第 422 行的 `#66c7e0` **就是 `--series-interactive` 的深色主題值**,被釘死因為「hero 永遠是
深色照片」;目前需要 `CLAUDE.md` 四段文字加 `series.spec.ts:144-159` 註解才能解釋。

### CSS 變數的關鍵性質與其陷阱

自訂屬性**不參與 specificity 競賽**,在賦值點解析、靠繼承傳播,因此消除一整類權重陷阱。

**但它有兩個反向陷阱,v1 各踩一個:**

1. **變數未定義時,整條宣告在 computed-value time 失效**,回退到該屬性的**初始值**(不是
   前一條規則的值)。所以 hero token 只能在 hero scope 內被消費,或必須帶 `var(x, fallback)`。
2. **把後代選擇器收斂成祖先變數會改變權重結構。** 原本靠「後代選擇器權重較高」壓住的規則,
   收斂後會讓較低權重的規則重新生效。

## 目標

1. 文章 frontmatter 支援 `headerStyle: text`。
2. 淺色與深色主題**都**正確且符合 WCAG(文字 4.5、非文字邊界 3:1),含導覽列與手機版。
3. 逐值複製 Hux 的淺色外觀。
4. 消除 14 個色值常數所編碼的失效假設。
5. **修掉 hidden 文章洩漏進公開 prev/next 的既有缺陷。**

## 非目標

- 不支援 `.site-heading` / `.page-heading` 的 text 模式(無需求)。
- **不做 `layout` 值正規化。** 見「已否決/延後」。
- 不套用到任何既有真實文章。
- 不修 `SearchButton.tsx` 的死 Tailwind 類別(已另開獨立任務)。
- 不動 `Header.tsx` 的捲動 JS。

## 決策記錄(人類已裁定)

1. **`headerStyle: text` 與 `headerImg`/`headerBgCss` 並存 → build 時拒絕。**
   text 模式的 OG 卡使用預設漸層。
   **推論:`lib/social-card.ts` 與 `contentlayer.config.ts` 的 computed fields 零改動。**
   因為拒絕使得「text + 殘留圖片」不可能存在,`selectSocialCardBackground` 在兩個欄位皆空時
   本來就回 `SOCIAL_CARD_FALLBACK`。這是驗證過的推論,不是假設。
2. **prev/next 改為過濾 hidden;hidden 僅能以路徑訪問。**
3. **`:has()` 方案已定案**,不再重新評估。
4. **`@supports` 保險已撤回**(理由見「已否決/延後」)。

## 架構

### 1. 資料層:`contentlayer.config.ts`

```ts
headerStyle: { type: 'enum', options: ['text'] },
```

`enum` 經確認為 contentlayer2 有效型別(`@contentlayer2/source-files/.../field.d.ts:113`)。
**這是本 repo 第一個 `enum` 欄位** —— 連 `layout` 都是 `type: 'string'` + 執行期回退。帶來
新的失敗模式:`headerStyle: txt` 會讓 `yarn contentlayer2 build`(進而 CI 的 `tsc --noEmit`)
直接失敗,而非靜默回退。已確認為期望的 fail-fast。

**互斥組合的 build 時驗證(決策 1)**:`headerStyle: text` 同時帶非空 `headerImg` 或
`headerBgCss` 時,建置必須失敗並指出檔名與衝突欄位。`enum` 表達不了跨欄位約束,因此驗證放在
`makeSource` 的 `onSuccess`(與 `createTagCount` / `createSearchIndex` 同層)。
**實作時必須先確認在 `onSuccess` 內 throw 真的會讓 `contentlayer2 build` 以非零狀態結束**
—— 若不會,改用會在 build 期求值並拋錯的 computed field。這條驗證同時被 CI 的 `ci` job 與
Vercel build 覆蓋。

### 2. `lib/hero-mode.ts` — hero 表面優先序純函式(新增)

沿用既定慣例「決策邏輯放 `lib/`、元件保持薄、配同名單元測試」:`lib/iframe.ts` 的
`resolveHeroIframeSrc`(`HuxHero.tsx:6` 已 import)+ `tests/unit/iframe.test.ts`;
`lib/social-card.ts` + `tests/unit/social-card.test.ts`。`HuxHero.tsx` 內聯的
`resolveHeaderImage` 與優先序三元是**例外,不是常態**。

```ts
export type HeroMode =
  | { kind: 'keynote'; iframeSrc: string }
  | { kind: 'text' }
  | { kind: 'css-background'; background: string }
  | { kind: 'image'; url: string; fallbackColor?: string }

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

優先序:**keynote > text > css-background > image**。

- `keynote` 優先於 `text`:沿用 `HuxHero.tsx:52` 既有 `hasIframe` 短路排最前的先例。
- `text` 必須**先於** `headerBgCss` 判斷(即使決策 1 已在 build 擋掉並存,執行期順序仍要正確,
  且單元測試要釘住這個優先序)。
- **`kind` 用 `css-background` 而非 `gradient`**:頁面端接受的是任意 CSS `background` 值,
  不限漸層(社群卡才只接受 `linear-gradient`)。命名要反映實情。
- **`image` 必須帶 `fallbackColor`**。這是 v1 的錯誤:`HuxHero.tsx:57` 是
  `backgroundColor: headerImg ? undefined : '#2D2D2D'`,存在兩個 URL 可能相同、呈現不同的狀態:
  - 未填 `headerImg` → 用 `/img/home-bg.avif` **且** inline `backgroundColor: #2D2D2D`
  - 明填同一個 URL → **不設** inline backgroundColor,沿用 class 的 `#777`(334 行區塊)

  丟失這項資訊會讓圖片載入前/失敗時的底色由 `#2D2D2D` 變成 `#777`。

**遮罩的等值約束**:commit A 必須零行為改變,故 `resolveHeroSurface` 第一版**完全複製現況**
—— 只要 `headerMask` 是有效數字就回傳,**不分模式**(現況 keynote + mask 也會渲染)。
「text 模式抑制遮罩」是行為改變,放到功能 commit,並在單元測試明確斷言這個轉變。

### 3. hero 色值處理(`css/tailwind.css`)

```css
.intro-header {
  --hero-fg: #fff;
  --hero-border: rgba(255, 255, 255, 0.8);
  --hero-link-hover: #66c7e0;
  color: var(--hero-fg);
}
```

**優先靠繼承,而不是把六個硬值換成六個 `var()`。** 427/436/450/458/470 這五條的 `color: #fff`
是 `.intro-header` 顏色的**冗餘重述** —— 直接刪除比轉成 `var()` 好。

> **刪除前的驗證閘(不可跳過)**:必須先確認 `@layer base`(63 行起)沒有直接對 `h1`–`h6` 或
> `.subheading` 設 `color`。**直接宣告在元素上會贏過繼承,與 cascade layer 無關**,刪掉就會
> 露出來。這是要用截圖證明的零像素變動,不能假設。若確有這類規則,該條就保留為
> `color: var(--hero-fg)`。

**tag 邊框(v1 的 blocker 1)**:`.tags .tag` 的 `border` shorthand 在 489 行,**是全域規則**,
文章列表卡片(`HuxPostCard.tsx:31`)、文章內文與側邊目錄都在用。把它改成
`border: 1px solid var(--hero-border)` 會讓 hero 外的變數未定義 → **整條宣告失效 →
`border-style` 回到初始值 `none`**,而 556-563 行只覆寫 `border-color`,補不回 `border-style`。
所有 tag 邊框會消失。

**因此 489 行不動**,改為新增 hero scope 的一條:

```css
/* hero token 只在 hero scope 內被消費。(0,3,0) > .tags .tag 的 (0,2,0) */
.intro-header .tags .tag {
  border-color: var(--hero-border);
}
```

### 4. navbar 色值變數化(`css/tailwind.css`)

```css
.navbar-custom {
  --navbar-fg: #fff;
  --navbar-fg-hover: rgba(255, 255, 255, 0.8);
  --navbar-bg: transparent;
}
```

改讀變數的六處:217(根 `color`)、235(`.navbar-brand`)、243(hover)、259(`.icon-bar`,
注意是 **`background`** 不是 `color`)、286(`.navbar-links a`、`.navbar-tools button`)、
301(`.navbar-tools svg`)。

**`is-fixed` 必須同時重設 hover token(v1 的 blocker 2)**:

```css
@media (min-width: 768px) {
  .navbar-custom.is-fixed {
    --navbar-fg: #2d2d2d;
    --navbar-fg-hover: #2d2d2d; /* 等值:複製「fixed 狀態 hover 不變色」的現況 */
    --navbar-bg: rgba(255, 255, 255, 0.9);
  }
  .dark .navbar-custom.is-fixed {
    --navbar-fg: #fff;
    --navbar-fg-hover: #fff;
    --navbar-bg: rgba(45, 45, 45, 0.9);
  }
}
```

`--navbar-fg-hover` 若漏掉就**不是等值替換**。目前淺色 fixed navbar 的文字 hover 時仍是深色,
純粹因為 `.navbar-custom.is-fixed .navbar-brand`(0,3,0)壓過 `.navbar-brand:hover`(0,2,0)。
把前者收斂成祖先變數後,後者重新生效並讀到基底的 `rgba(255,255,255,.8)` —— 疊在
`rgba(255,255,255,.9)` 白底上就是白底白字。

**刻意不做 `--navbar-border`**:基底 `.navbar-custom` 目前**沒有** border 宣告,
`border-bottom` 只存在於 `is-fixed`(1560)與其深色變體(1586,只覆寫顏色)。為對稱而在基底
加 transparent border **會憑空多出 1px 高度**,違反零像素變動;而深色覆寫本來只有一行顏色,
變數化零收益。

### 5. text 模式 CSS

```css
.intro-header-text {
  background: none; /* shorthand 會把 background-color 一併重置為 transparent,
                       清掉 .intro-header 的 #777(331 行) */
  --hero-fg: var(--hux-text);
  --hero-border: var(--hux-text);
  --hero-link-hover: var(--series-interactive);
}

/* Hux 的 style-text 在所有斷點都是 85/20。padding 不是變數,仍需權重:
   寫成單一 class 會跟桌面規則 .intro-header-post .intro-header-content(0,2,0,1597 行)
   平手而輸在原始碼順序。 */
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

**tag hover 必須有深色變體。** Hux 的 `rgba(0,0,0,.05)` 是淺色專用;深色模式往 `rgb(45,45,45)`
疊 5% 黑會**更暗**,回饋消失。本 repo 既有慣例正是為 hover 底色寫深色變體
(`.dark #tag_cloud .tag:hover`,715 行)。

`--hero-link-hover` 在 text 模式改吃 `--series-interactive`,是**唯一需要因主題而不同值**的
顏色。實測對比(WCAG,對實際底色):

| 顏色 | 淺色底(白) | 深色底(`#2d2d2d`) | 判定 |
| --- | --- | --- | --- |
| `--hux-text` | 10.36 | 10.43 | 通過 |
| `#66c7e0`(原釘死值) | **1.94** | 7.08 | 淺色不合格 |
| `--series-interactive` | 6.49 | 7.08 | 通過 |
| `#0085a1`(Hux invert hover) | **4.31** | **3.19** | 皆不合格,不採用 |

### 6. 導覽列 tone(`:has()`)

`<Header />`(`app/layout.tsx:105`)與 `<main>{children}</main>` 是**兄弟節點**,拿不到
frontmatter。資訊在下、需求在上,React 單向資料流無 prop 路徑可走。`:has()` 讓瀏覽器做反向
查詢,純宣告式:DOM 一變樣式立刻跟著變,無 effect、無時序、無殘留狀態。

**選擇器限縮到 `main` 內**(採納審查建議):不讓 body 內任一同名 class 都能改 navbar。

```css
/* 桌面:fixed 有自己的實心底,text tone 只在非 fixed 時套用 */
body:has(main .intro-header-text) .navbar-custom:not(.is-fixed) {
  --navbar-fg: var(--hux-text);
  --navbar-fg-hover: var(--series-interactive);
}

/* 手機:JS 在所有 viewport 都會加 is-fixed(Header.tsx:42),但手機沒有 fixed 視覺狀態
   —— 那整組規則都在 @media (min-width: 768px) 內(1485 行),導覽列始終是 position:absolute
   的透明疊層。因此手機不能被 is-fixed 排除,否則捲動回頂端途中(scrollY 僅數 px、導覽列
   已部分可見而 is-fixed 尚未移除)會是白字白底。 */
@media (max-width: 767px) {
  body:has(main .intro-header-text) .navbar-custom {
    --navbar-fg: var(--hux-text);
    --navbar-fg-hover: var(--series-interactive);
  }
}
```

`:not(.is-fixed)` 在桌面是必要的:`:has()` 權重等於其參數最高權重,整條
`body:has(main .intro-header-text) .navbar-custom:not(.is-fixed)` 是 (0,3,1),會壓過
`.navbar-custom.is-fixed` (0,2,0)。用 `:not()` 讓兩者以 class 互斥,比賭權重穩健。

> v1 聲稱這條規則「一次涵蓋手機與桌面、不必放進任何 media query」—— **該說法錯誤**,已修正。

**`data-navbar-tone` 語意屬性延後**:審查建議改用語意屬性而非樣式 class。限縮到 `main` 已
解決「範圍過寬」的實際風險;引入平行屬性會多一個真相來源。等出現第二種 page chrome tone
時再升級(YAGNI)。

### 7. prev/next 過濾 hidden(決策 2)

`app/[year]/[month]/[day]/[slug]/page.tsx:96` 目前是 `allCoreContent(sortPosts(allBlogs))`,
**未過濾**,且同一份清單同時用於**定位當前文章**與**計算 prev/next**:

```ts
const postIndex = sortedCoreContents.findIndex(...)
if (postIndex === -1) return notFound()
const prev = sortedCoreContents[postIndex + 1]
const next = sortedCoreContents[postIndex - 1]
```

**天真地過濾會讓 hidden 文章自己的頁面 404**,直接違反決策 2 與既有測試
(`blog-parity.spec.ts:67-68` 斷言 hidden 路徑回 200)。因此必須把兩個職責拆開:

- **定位**:沿用既有的 `findPost(params)`(105 行已在用),含 hidden → 直接路徑照樣可訪問。
- **導覽**:另一份過濾後的清單計算 prev/next;hidden 文章在該清單中找不到 → **沒有
  prev/next**(合理:它不在公開序列上)。

可見性政策集中出 `lib/` 的單一來源(例如 `listedPosts()` / `isNavigablePost()`),供 pager
與其他公開表面共用,避免第四份各自為政的過濾邏輯。

**這修掉一個既有缺陷**:`data/blog/hidden/` 目前有 6 篇,全部已經在公開 pager 鏈上。
現有 pager 測試只斷言 slot 存在與幾何、不斷言連結目標,故不受影響。

**這也讓 fixture 可以安全地用當日日期** —— 否則 2026-07-30 的 hidden fixture 會讓目前最新
公開文章(`2026-07-25-openwiki-tame-agents-md`,即 `newestPostPath`)多出一個 Next,違反
`blog-parity.spec.ts:310` 的「最新文章只有 previous」。

## Cascade layer 硬性約束

`css/tailwind.css` 分層:`@import 'tailwindcss'`(1)、`@layer base`(63)、
`@layer utilities`(104,約 141 行結束),**其後全部未分層** —— 包含所有 navbar 與 hero 規則。

Tailwind v4 把工具類放進 layer,而**未分層作者樣式無條件贏過任何 `@layer` 內規則,與
specificity 無關**。因此:

- 所有新規則**必須留在未分層區**。包進 `@layer components` 會被任何 Tailwind 工具類蓋掉,
  失敗模式極隱晦:DevTools 看得到規則且未被劃掉,是輸在 layer 順位而非權重。
- **不要**把 `.navbar-tools svg`(301)搬進任何 `@layer`。它目前靜默蓋掉
  `SearchButton.tsx:24` 的 `text-gray-900 dark:text-gray-100`;搬層會讓那批死類別突然復活。
- 推論:本文件所有 specificity 元組**只在「同層」前提下有意義**。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `contentlayer.config.ts` | `headerStyle` enum 欄位 + 互斥組合的 build 時驗證 |
| `lib/hero-mode.ts` | 新增 |
| `lib/post-visibility.ts`(或併入既有 lib) | 新增:`listedPosts()` / `isNavigablePost()` |
| `app/[year]/[month]/[day]/[slug]/page.tsx` | 拆開定位與導覽清單 |
| `components/hux/HuxHero.tsx` | 改用 `resolveHeroSurface`;加 `intro-header-text` class;text 模式不產生 inline `style`、不渲染遮罩 |
| `layouts/PostLayout.tsx` | 多解 `headerStyle` 並傳給 `HuxHero` |
| `css/tailwind.css` | 繼承化 + 變數化 + text 模式 + `:has()` |
| `data/blog/hidden/2026-07-30-header-style-text-test.md` | 新增(全 ASCII) |
| `tests/unit/hero-mode.test.ts` | 新增 |
| `tests/unit/hero-rendering.test.ts` | 新增(static rendering 契約) |
| `tests/unit/post-visibility.test.ts` | 新增 |
| `tests/playwright/header-style-text.spec.ts` | 新增 |
| `tests/playwright/helpers/theme.ts` | 新增:抽出 `setTheme` / `contrastRatio` / `colorsFor`(`series.spec.ts:20-38`),**並加上 alpha 合成**;`series.spec.ts` 改 import 後必須維持全綠 |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都加 `headerStyle` + 互斥規則 + OG 策略 |
| `README.md` | 功能清單一行 |
| `series.spec.ts:144` 註解 / `openwiki/testing/quality-contracts.md:44` | 「Hero 永遠是深色照片」→ 限定為「此 image hero fixture」 |
| `CLAUDE.md` / `AGENTS.md` | 新教訓 |

**inline style 是不可繞過的約束**:`HuxHero.tsx:52-59` 把背景寫成 inline `style`,inline 贏過
任何 class 規則。純 CSS **蓋不掉** `backgroundImage` 的 fallback,故 text 模式必須讓元件根本
不產生 `style`。

`next-env.d.ts` 一律排除,commit 用明確的 `git add <檔案清單>`。

## 測試與驗收

### CI 覆蓋範圍的硬限制(決定測試該放哪一層)

必過的 `ci` job(`.github/workflows/ci.yml`)只跑:`yarn contentlayer2 build`、
`yarn eslint`、`yarn tsc --noEmit`、`yarn test:unit`。**Playwright(`yarn test:parity`)
不是 CI gate。**

因此**核心契約必須落在 unit / static-rendering 層**才有強制力;Playwright 負責只有真實
瀏覽器能驗的東西(計算色、對比、幾何、捲動狀態)。出貨前必須手動跑
`yarn test:parity` 全綠,並在 PR 描述記錄結果。

### Unit:`tests/unit/hero-mode.test.ts`

窮舉 `iframe × headerStyle × headerBgCss × headerImg` 組合表:

- `iframe` + `text` → `keynote`(釘死優先序)
- `text` + `headerImg` → `text`;`text` + `headerBgCss` → `text`
- `headerBgCss` 帶尾隨分號 → 清理後的值(補上目前只有 `HuxHero.tsx:46-50` 註解保護的修復)
- 未填 `headerImg` → `image` + `/img/home-bg.avif` + **`fallbackColor: '#2D2D2D'`**
- 明填 `/img/home-bg.avif` → `image` + 同 URL + **`fallbackColor: undefined`**(釘死 blocker 3)
- commit A:遮罩行為與現況逐項相同(含 keynote + mask);功能 commit:`text` → `maskOpacity === null`

### Unit:`tests/unit/hero-rendering.test.ts`(static rendering)

用 `renderToStaticMarkup`(沿用 `tests/unit/series-rendering.test.ts:36` 既有 harness),
覆蓋 Contentlayer → PostLayout → HuxHero 的接線契約 —— 這是**唯一在 CI 內**能驗 markup 的層:

- text 模式:`<header>` 帶 `intro-header-text`、**無 `style` 屬性**、**無 `.header-mask`**
- text + series:series metadata markup 正確產出(補上 Playwright 測不到的系列組合)
- 圖片模式:仍帶 inline `style`(防回歸)

### Unit:`tests/unit/post-visibility.test.ts`

- hidden 文章不出現在 `listedPosts()`
- hidden 文章的相鄰公開文章,prev/next 互指(跳過 hidden)
- **hidden 文章本身沒有 prev/next,但仍可被定位**(釘死「過濾不得造成 404」)

### Playwright:`tests/playwright/header-style-text.spec.ts`

**helper 必須先修 alpha(blocker 5)。** 現有 `relativeLuminance`
(`series.spec.ts:9-13`)用 `.match(/\d+/g)?.slice(0, 3)` —— **直接丟掉 alpha**,會把
`rgba(0,0,0,.05)` 當純黑、`rgba(255,255,255,.08)` 當純白。抽出時必須加上對有效背景的
alpha 合成。

**hover 底色要拆成兩個獨立契約**,不能用單一 4.5 判定:

| 契約 | 斷言 | 為何不能合併 |
| --- | --- | --- |
| 可讀性 | alpha 合成後,**文字**對有效背景 ≥ 4.5 | 刪掉深色 hover 規則後文字仍高對比 → 突變不會紅 |
| hover 回饋 | 淺色模式底色**變暗**、深色模式底色**變亮**(方向性) | 合成後實際差異僅 1.12:1 / 1.29:1,本來就不該以 4.5 判定 |

**非文字邊界用 WCAG 1.4.11 的 3:1**,不是一律 4.5:tag 邊框屬必要 UI 邊界。

主要不變量仍以量測值計算對比而非比對顏色字串(斷言「淺色時 h1 是 `rgb(64,64,64)`」既脆弱又是
空包彈溫床)。涵蓋清單(明/暗兩輪):hero h1、subtitle、`Posted by` meta、tag 文字、
tag 邊框(3:1)、tag hover(兩契約)、導覽列品牌/連結/ThemeSwitch 文字/搜尋 SVG、
`.icon-bar`、系列連結靜止與 hover。

關係型斷言:

- text 文章 h1 色 `===` `body` 計算色;**對照組**:圖片文章 h1 `===` 白
- 導覽列品牌色在 text 文章 `===` body 文字色、在圖片文章 `===` 白
- 主題切換前後同一元素顏色**必須不同**(證明真的吃變數)
- text 文章 hero `background-image` 為 `none`;圖片文章不為 `none`
- 桌面斷點 `.intro-header-content` 上下 padding 為 85/20 而非 150
- **hero 外的 tag 邊框仍可見**(釘死 blocker 1:post card、文章內文、側邊目錄)
- **fixed navbar hover 不得接近底色**(釘死 blocker 2,明/暗兩輪)

視窗矩陣:mobile 375 / desktop 1280 × 明/暗 × 捲動前/捲動後。
**手機必須額外測「捲動下去再回到接近頂端」** —— 那是 `is-fixed` 仍在而導覽列已部分可見的窗口。

**系列文測試分層(取代 v1 的注入 class 方案)**。v1 打算在圖片系列文章上用 JS 注入
`.intro-header-text` —— **該方案無效**:圖片文章保有 inline background,而本文件自己就寫了
class 蓋不掉 inline style,量到的會是 text 前景色對**圖片**背景,毫無意義;也完全沒測到接線。
改為:

| 層 | 覆蓋 |
| --- | --- |
| Unit(`hero-mode`) | 優先序、清理、mask、fallbackColor |
| Static rendering(`hero-rendering`) | text + series 的 markup、class、無 style、無 mask |
| Production E2E | 真實 hidden fixture 路徑的實際背景與對比 |
| Image-series E2E | 保留現有圖片 hero 的 hover 契約(`series.spec.ts` 不變) |

**反向不變量警告**:**不可**複製 `series.spec.ts:148-159` 的「兩主題 hover 同色」。那條的
前提是「hero 永遠是深色照片」,text 模式打破它。照抄會斷言**錯誤的不變量**並綠燈通過 ——
與 CLAUDE.md 記錄的 #64/#65 同型空包彈。text 模式的方向要反過來:兩主題 hover 色**必須不同**。

### 突變測試矩陣(每條斷言都要做)

| 突變 | 應變紅的斷言 |
| --- | --- |
| 刪 `.dark ... .tag:hover` | 深色 tag hover **方向性**(不是對比 4.5) |
| `--hero-link-hover` 改回 `#66c7e0` | 淺色系列連結 hover 對比 |
| 刪整條 `:has()` 規則 | 導覽列品牌色關係斷言(明/暗 × 手機/桌面) |
| 刪 `@media (max-width: 767px)` 那條 | 手機「捲動後回頂端」的導覽列可讀性 |
| `is-fixed` 漏掉 `--navbar-fg-hover` | fixed navbar hover 對比 |
| 把 489 行改成消費 `--hero-border` | hero 外 tag 邊框可見性 |
| `var(--hux-text)` 改成 `#404040` | 深色 h1 對比 + 「切換主題顏色要變」 |
| 拿掉 `:not(.is-fixed)` | 桌面捲動後浮動列顏色 |
| 元件不再短路 inline style | hero `background-image` 為 `none` |
| 覆寫降成單一 class | 桌面 padding 85/20 |
| `image` 模式丟掉 `fallbackColor` | 未填 `headerImg` 的 fallback 底色單元測試 |
| pager 用未過濾清單 | hidden 不得進公開 pager |
| pager 用過濾清單定位當前文章 | hidden 路徑仍回 200 |

### production 目視驗收

`yarn build` → 綁 `127.0.0.1:3012`(**驗證後必須關閉該程序**)。CLAUDE.md 明令互動驗證不得用
dev server(冷路由首次點擊 ~1.5 秒是按需編譯)。

- 兩主題 × mobile/desktop 截圖
- 兩個捲動狀態,含手機「捲回接近頂端」
- 手機展開漢堡:三條線與下拉面板
- **在頁面上實際切換主題**(非重載),確認顏色即時跟著變
- 用 `getComputedStyle` 量實際值,不從 CSS 原始碼推論

### 字型預算

fixture 內容(標題、副標、tags、正文)**刻意全 ASCII**。`scripts/site-font-text.mjs:58` 的
`markdownFiles` 會遞迴進 `hidden/`,hidden 文章一樣計入預算;ASCII 全在 `PRINTABLE_ASCII` →
進 core → 新頁面碰桶數為 1,零新增 bucket、零產物重生成。完成後跑
`yarn check:site-font --full`(CI 的必過 `check` job 跑的正是 `--full`)。

## Commit 序列

原則:等值重構各自獨立(零行為改變,用既有測試組當守門員);**但功能本身必須是原子的**。

| # | 內容 | 驗收 |
| --- | --- | --- |
| A | `lib/hero-mode.ts` + 窮舉表單元測試(含 `fallbackColor`)+ `HuxHero` 接線 | 不碰 CSS;既有測試組全綠 |
| B | hero 顏色繼承化 + `--hero-*` token + hero-scoped tag 邊框 | **零像素變動**;含 `@layer base` 驗證閘;含 hero 外 tag 邊框回歸測試 |
| C | navbar 變數化(含 `.icon-bar`、`is-fixed` 兩組**含 hover token**) | **零像素變動**;含 fixed navbar hover 回歸測試 |
| D | 可見性政策集中化 + pager 過濾 hidden | hidden 路徑仍 200、公開 pager 不含 hidden |
| E | **原子功能 commit**:`enum` 欄位 + 互斥驗證 + text surface CSS + navbar tone + fixture + unit/static/E2E 測試 | 不得拆成「text hero」與「navbar 修復」兩個可部署 commit |
| F | 雙語手冊 + README + `series.spec.ts`/OpenWiki 契約措辭 + CLAUDE.md 教訓 + `openwiki code --update` | — |

**E 不可再拆**:Vercel 部署 main 的每個 commit。若 text hero 先落地而 navbar tone 在下一個
commit,中間會有一個 production 狀態是白字白底。

**自檢**:E 的 diff 若出現任何十六進位色碼,代表 B/C 沒做乾淨,先停下檢查。

B/C 的比對範圍:圖片文章、首頁、archive、series、about、404、offline(全部呼叫 `HuxHero` 且
寫死 `headerImg`)+ **文章列表卡片、文章內文 tag、側邊目錄**(blocker 1 的受害範圍)。

**不要改動 `blog-parity.spec.ts:363` 釘死的那篇文章** —— 它是 service worker 跨網域 hero 圖
快取測試,需要真實圖片。

## 已否決/延後

- **`@supports not selector(:has(*))` 保險** —— 已否決。官方文件確認 Tailwind v4 最低要求
  Chrome 111 / Safari 16.4 / Firefox 128,而 `:has()` 支援起始為 105 / 15.4 / 121,
  **三者皆低於 Tailwind 門檻**。任何能渲染本站的瀏覽器都已支援 `:has()`,該分支永遠不會執行
  —— 保護的是一組站台本來就已壞掉的瀏覽器。永遠不執行、只能靠造假驗證的分支比沒有分支更糟。
- **React Context + client state 傳遞 `headerStyle`** —— 已否決。首屏 SSR 時 context 為空,
  白字先渲染再翻深色(會閃);站內導覽依賴 effect 時序。這正是 `HuxHero.tsx:46-50` 記錄的
  「站內連結進來背景消失」同一類失敗模式。
- **把 `<Header />` 移出 root layout** —— 已否決。要動七條以上路由且導覽列從此重複,是
  **增加**維護風險。
- **`resolvePostPresentation()` 含 `layout` 正規化 —— 延後,另案處理。** 前提已驗證且比審查
  所述更極端:`data/blog` 的 `layout` 值只有 `keynote`(2)與 `post`(15),而
  route 的 map 只認 `PostLayout`/`PostSimple`/`PostBanner`,**每一篇都靠 unknown fallback 落到
  `PostLayout`**,包含兩篇 `keynote`。這是真實隱患,但 (a) 非本功能造成;(b) 修它要決定
  `keynote` 該映射到什麼,是內容行為決策;(c) 影響 17 篇文章的 layout 解析。折進來會讓一個
  hero/CSS 功能的爆炸半徑擴大到全站 layout 選擇。應以 characterization test 釘住現況後另案處理。
- **`data-navbar-tone` 語意屬性** —— 延後。限縮到 `main` 已解決範圍過寬的實際風險。

## 已知未處理問題(刻意留下)

1. **`SearchButton.tsx:24` 的 `text-gray-900 dark:text-gray-100` 是死碼**(被未分層的
   `.navbar-tools svg` 無條件蓋掉)。與本功能無關,已另開獨立任務。`ThemeSwitch.tsx` 的圖示走
   同一條規則,需一併檢查。**注意**:只要這批死類別還在,「單一前景 token」在 SVG 上就不是
   真的成立 —— 子元素上的指定值會贏過祖先繼承。本功能靠的是 `.navbar-tools svg` 這條未分層
   規則仍在生效,不是靠繼承。
2. **`layout: PostSimple` / `PostBanner` 目前無人使用,但可達。** 兩者不 import `HuxHero`,
   所以會靜默忽略 `headerStyle`。現有 17 篇的 `layout` 值全是 `post`/`keynote`,都落到 unknown
   fallback → `PostLayout`,因此**實際零使用**;但 `layouts` map 確實有這兩個 key,任何新文章
   寫 `layout: PostSimple` 都會生效,兩份手冊也把它們記載為可選值。故手冊必須寫明
   `headerStyle` 僅對 `PostLayout` 有意義。
   **更徹底的解法是刪掉這兩個版面**(它們是 tailwind-nextjs-starter-blog 遺留,零文章使用,
   卻讓 #63 系列功能必須同步改它們、並被 `tests/unit/series-rendering.test.ts:58-59` 釘住)。
   刪除後這個組合在結構上不可能存在。屬獨立清理,不折進本功能。
3. **keynote(`iframe`)+ `headerMask` 會把遮罩渲染在 iframe 上**,可能阻擋點擊。既有行為,
   本次刻意保持不變(commit A 必須零行為改變),未觀察到有文章使用該組合。
4. **`text` + `images` frontmatter 時 JSON-LD 仍會用 `images[0]`。** 決策 1 只擋
   `headerImg`/`headerBgCss`。`images` 是獨立的社群圖欄位,與 hero 無關,刻意不擋。

## 審查修正記錄(Codex 唯讀審查,全部經本地驗證)

| # | 問題 | 驗證依據 | 修正 |
| --- | --- | --- | --- |
| 1 | `--hero-border` 讓 hero 外 tag 邊框消失 | 489 行 shorthand 是全域;556-563 只覆寫 `border-color`,補不回 `border-style` | 489 行不動,改用 hero-scoped `.intro-header .tags .tag` |
| 2 | navbar 變數化不是等值替換 | 241(0,2,0)目前被 1570(0,3,0)壓住;收斂後前者復活 | `is-fixed` 兩組都補 `--navbar-fg-hover` |
| 2b | `:not(.is-fixed)` 不適合手機 | `Header.tsx:42` 所有 viewport 都加 class;視覺規則限 1485 桌面斷點 | 拆成桌面 `:not()` + 手機 `max-width: 767px` 無條件 |
| 3 | `HeroSurface` 表達不了 fallback 底色 | `HuxHero.tsx:57` 的 `headerImg ? undefined : '#2D2D2D'` | `image` 加 `fallbackColor` |
| 4 | hidden fixture 污染公開 pager | `page.tsx:96` 未過濾;`blog-parity.spec.ts:310` 斷言最新文章只有 previous | 集中可見性政策 + 拆開定位與導覽清單 |
| 5 | contrast helper 忽略 alpha | `series.spec.ts:9-13` 的 `.slice(0, 3)`;實測合成後僅 1.12:1 / 1.29:1 | 加 alpha 合成;hover 拆兩契約;邊框用 3:1 |
| 6 | 注入 class 的 series 測試無效 | 圖片文章保有 inline background,class 蓋不掉 | 改四層測試分層 |
| — | Playwright 不是 CI gate | `ci.yml` 只跑 contentlayer/lint/tsc/unit | 核心契約移到 unit + static rendering |
