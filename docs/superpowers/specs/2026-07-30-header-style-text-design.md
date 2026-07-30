# 文章純文字 hero(`headerStyle: text`)設計(PR2)

> **依賴 PR1**(`2026-07-30-post-publication-policy-design.md`)。PR1 修掉 hidden 洩漏進公開
> pager 之後,本 PR 的測試 fixture 才能直接用當日日期而不需要閃避 pager 斷言。
>
> 本文件是**規範正文 + 驗證計畫**。歷次審查踩過的坑與否決理由留在 git commit message
> (`git log --grep=text-hero`),不再夾在正文裡 —— 修訂歷史與規範互相矛盾是前幾版的實際問題。

## 背景

Hux 原始主題支援 `header-style: text`:文章 hero 不放底圖、不放漸層、不放遮罩,標題與
metadata 直接落在頁面底色上。參考頁 <https://huangxuan.me/2020/07/05/reflection-2020/>。

從該頁 HTML 與 `hux-blog.min.css` 取得的權威實作,總共動兩個地方 —— **第二個極容易漏**:

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

Hux 的 `padding: 85px 0 20px` 權重 (0,3,0) 壓過桌面的 `150px` (0,2,0),所以 **text 模式在所有
斷點都是 85/20**。`#404040` 恰好等於本專案 `--hux-text` 的淺色值 `rgb(64,64,64)`。

## 根因:14 個色值常數編碼同一個即將失效的不變量

hero 的 8 個(`.intro-header` 根 `color`、`.site-heading h1`、`.site-heading .subheading`、
`.post-heading h1`、`.post-heading .subheading`、`.post-heading .meta/.series-meta`、
`.tags .tag` 的 `border`、`.intro-header-post .series-meta a:hover` 的 `#66c7e0`)加上導覽列的
6 個,**全部在編碼同一個事實:「hero 背景永遠是深色」**。`headerStyle: text` 是第一個讓它變成
假的東西。

窄改法會留下 14 個原常數 + 一組平行覆寫,兩種模式可無聲漂移;token 化讓 text 模式縮成數行賦值。

`.intro-header-post .series-meta a:hover` 的 `#66c7e0` **就是 `--series-interactive` 的深色值**,
被釘死因為 hero 永遠是深色照片 —— 目前要靠 `CLAUDE.md` 四段文字加 `series.spec.ts` 的註解才能
解釋它存在的理由。

### CSS 變數的性質與其兩個反向陷阱

自訂屬性的**宣告**完整參與 cascade;差異在**消費端**讀到的是繼承後已定勝負的值,所以消費點不必
再打權重戰。但:

1. **變數未定義時整條宣告在 computed-value time 失效**,回退到該屬性的**初始值**(不是前一條
   規則的值)。所以 hero token 只能在 hero scope 內被消費,或必須帶 `var(x, fallback)`。
2. **把後代選擇器收斂成祖先變數會改變權重結構**,原本靠後代選擇器壓住的規則會重新生效。

## 目標

1. frontmatter 支援 `headerStyle: text`,並在 build 時擋掉所有無效組合。
2. 淺色與深色主題**都**符合 WCAG(文字 4.5、非文字邊界 3:1),含導覽列與手機版。
3. 逐值複製 Hux 的淺色外觀。
4. 消除 14 個色值常數所編碼的失效假設。
5. **正規化導覽列 popup 的 cascade**,並修掉 popup focus 態既有的 2.31 對比缺陷。

## 非目標

- 不支援 `.site-heading` / `.page-heading` 的 text 模式(首頁、archive、series、about、404、
  offline 全部寫死 `headerImg`,無需求)。
- 不做 `layout` 值正規化,也不刪未使用的 starter 版面(見 memory `unused-starter-layouts`)。
- 不改全域 focus outline 的顏色(`css/tailwind.css` 的 focus-visible 規則用同一顆青色、白底
  2.31,低於非文字 3:1)。這是第三件事,獨立處理。
- 不動 publication policy(PR1)。
- 不套用到任何既有真實文章。

## 決策記錄(人類已裁定)

1. **`headerStyle: text` 與 `headerImg`/`headerBgCss` 並存 → build 時拒絕**;text 模式的 OG 卡
   使用預設漸層。**推論(已驗證):`lib/social-card.ts` 與 contentlayer computed fields 零改動**
   —— 拒絕使得「text + 殘留圖片」不可能存在,而 `selectSocialCardBackground` 在兩欄皆空時本來
   就回 `SOCIAL_CARD_FALLBACK`。
2. **`:has()` 方案定案**,不再重新評估。
3. **`@supports` 保險撤回**(見「已否決」)。
4. **`iframe` + `headerStyle: text` → build 時拒絕。** 執行期優先序仍是 keynote 勝(單元測試
   釘住),但作者層不接受這個組合。
5. **popup cascade 正規化**:刪除廣域 `.navbar-tools button/svg` 顏色宣告與因此產生的
   `[role='menu']` 補償規則,popup 前景/背景交還元件。**Commit C 因此不再是零像素變動** ——
   它是刻意的正規化,並修掉 popup focus 的 2.31。

## 架構

### 1. Schema 與執行期閘門

```ts
headerStyle: { type: 'enum', options: ['text'] },
```

**⚠️ `enum` 不做執行期驗證。** contentlayer2 0.5.8 的原始碼:

```ts
// @contentlayer2/source-files/src/fetchData/mapping/parseFieldData.ts
enum: zod.string(), // TODO
// @contentlayer2/source-files/src/fetchData/mapping/index.ts
case 'enum': // TODO validate enum value
```

`headerStyle: txt` **會被執行期接受**,而生成的 TypeScript 型別宣稱它是 `'text'` —— 型別在說謊,
resolver 拿到 `'txt'` 會靜默落到 image mode。這正是本設計想消滅的失敗模式。

| 機制 | 負責 |
| --- | --- |
| `type: 'enum', options: ['text']` | **只**產生 TypeScript union 與編輯器提示 |
| `parseHeaderStyle(value: unknown)` | 執行期驗證,唯一真實閘門 |

**每個欄位各自 parse 成 domain value,不用一顆泛用的「trim 後判空」函式。** 三者空值語意不同:
`headerMask: 0` 是有效值、`headerImg: ""` 等於未設、`headerStyle` 只有一個合法字面值。
validator 與 resolver 共用的是**解析後的 domain object**,不是一組 helper 慣例 —— 這才是「兩者
不會漂移」的實質保證。

#### 互斥組合驗證

`headerStyle: text` 同時帶下列任一項 → build 失敗並指出檔名與衝突欄位:

| 欄位 | 理由 |
| --- | --- |
| `headerImg`、`headerBgCss` | 決策 1 |
| `iframe` | 決策 4 |
| `headerMask` | text renderer 強制 `maskOpacity: null`,OG fallback 漸層也不用它 —— 完全惰性。**`headerMask: 0` 是有效值,不可用 truthy 判斷** |
| `layout: PostSimple` / `PostBanner` | 兩者可達但不 render `HuxHero`。**denylist 的已知限制**:未來新增其他不支援 hero 的 layout 仍會漏掉(capability registry 屬另案) |

失敗傳播已驗證:`@contentlayer2/core` 的 `generate-dotpkg.ts` 把 callback rejection 包成
`SuccessCallbackError` 送進失敗路徑,所以在 `onSuccess` 內 throw 就會讓 build 失敗。

#### `onSuccess` 的執行順序與可測性

現況依序執行 `collectSeries` → `createTagCount` → `createSearchIndex`,後兩者會寫出
`app/tag-data.json` 與 `public/search.json`。驗證若排在後面,無效 frontmatter 會先污染這兩個
產物,形成「build 失敗但工作樹已被部分改動」。

**抽出可注入依賴的 orchestration**,讓真正的 `onSuccess` 只是呼叫它:

```ts
export async function runContentDerivedOutputs(blogs, deps) {
  deps.assertValidHeroConfigurations(blogs) // 必須第一個,在任何 project-owned 產物寫出前
  deps.collectSeries(blogs)
  await deps.createTagCount(blogs) // 現況漏了 await,錯誤不會傳回 contentlayer
  deps.createSearchIndex(blogs)
}
```

(`.contentlayer` 本身在 `onSuccess` 執行前就已生成,擋不住;能擋的是上面這三個產物。)

測試除了 orchestration helper 本身,**還要守住實際 callback 的 wiring** —— 否則有人從 config
移除呼叫,helper 單測仍全綠。

### 2. `lib/hero-mode.ts`

沿用既定慣例「決策邏輯放 `lib/`、元件保持薄、配同名單元測試」(`lib/iframe.ts` 的
`resolveHeroIframeSrc` + `tests/unit/iframe.test.ts`;`lib/social-card.ts` + 其測試)。
`HuxHero` 內聯的 `resolveHeaderImage` 與優先序三元是**例外,不是常態**。

```ts
export type HeroMode =
  | { kind: 'keynote'; iframeSrc: string }
  | { kind: 'text' }
  | { kind: 'css-background'; background: string }
  | { kind: 'image'; url: string; fallbackColor: string | null }

export type HeroSurface = { mode: HeroMode; maskOpacity: number | null }

export function resolveHeroSurface(input: {
  headerStyle?: 'text'
  iframe?: string
  headerImg?: string
  headerBgCss?: string
  headerMask?: unknown
}): HeroSurface
```

優先序:**keynote > text > css-background > image**。

- `keynote` 優先於 `text`:沿用既有 `hasIframe` 短路排最前的先例。
- `text` 必須**先於** `headerBgCss` 判斷(即使 build 已擋並存,執行期順序仍要正確)。
- `kind` 用 **`css-background`** 而非 `gradient`:頁面端接受任意 CSS `background` 值,只有社群卡
  限定 `linear-gradient`。命名要反映實情。
- `image` 的 **`fallbackColor` 是 required `string | null`**,不是 optional。現況
  `backgroundColor: headerImg ? undefined : '#2D2D2D'` 存在兩個 URL 可能相同、呈現不同的狀態:
  未填 `headerImg` → 用 `/img/home-bg.avif` **且** inline `#2D2D2D`;明填同一 URL → 不設 inline
  色、沿用 class 的 `#777`。設成 optional 的話漏填時 TypeScript 不會抗議,而症狀(圖片載入前
  底色改變)在測試裡幾乎看不出來。
- `headerStyle` 收緊成 `'text'` 而非 `string`;`HuxHero` props 同樣收緊,`variant: 'home' |
  'archive'` 搭配 `headerStyle?: never`,把「非目標」的組合從型別上封死。

**遮罩的等值約束**:commit A 必須零行為改變,故第一版**完全複製現況** —— 只要 `headerMask` 是
有效數字就回傳,**不分模式**(現況 keynote + mask 也會渲染遮罩)。「text 模式抑制遮罩」是行為
改變,放到功能 commit,並在單元測試明確斷言這個轉變。

### 3. hero 顏色 token

```css
.intro-header {
  --hero-fg: #fff;
  --hero-border: rgba(255, 255, 255, 0.8);
  --hero-link-hover: #66c7e0;
  color: var(--hero-fg);
}
```

**`.post-heading .meta, .post-heading .series-meta` 絕對不能刪。** 該元素同時帶
`.post-series-link-top`,而後者**直接宣告** `color: #666`;下一條 `.dark
.post-series-link-top:not(.series-meta)` 的 `:not()` 就是兩 class 共存的鐵證。
目前 `.post-heading .series-meta`(0,2,0)壓過 `.post-series-link-top`(0,1,0);刪掉前者後
`#666` 這個**直接宣告會贏過從 `.intro-header` 繼承的顏色**,結果是 series 那句話變灰、其 `<a>`
因 `color: inherit` 一起變灰,**直接破壞現有 image hero**。保留為:

```css
.post-heading .meta,
.post-heading .series-meta { color: var(--hero-fg); }

/* --hero-link-hover 的 consumer,必須明列否則是死 token */
.intro-header-post .series-meta a:hover,
.intro-header-post .series-meta a:focus { color: var(--hero-link-hover); }
```

> **刪除其餘四條(`.site-heading h1`、`.site-heading .subheading`、`.post-heading h1`、
> `.post-heading .subheading`)前的驗證閘,不可跳過**:必須**搜尋整份 CSS 中所有直接命中目標
> 元素的 `color` 規則**(含元素選擇器、該元素身上任何其他 class、`.dark` 變體),**不是只看
> `@layer base`** —— 上面那個反例就在未分層區。**直接宣告永遠贏過繼承,與 layer 和 specificity
> 高低都無關**;繼承只在該元素完全沒有 `color` 宣告時才生效。任一條有反例就保留為
> `color: var(--hero-fg)`。零像素變動必須用截圖證明。

**tag 邊框:全域的 `border` shorthand 規則不動。** `.tags .tag` 的 shorthand 是全域規則,
文章列表卡片、文章內文、側邊目錄都在用;把它改成消費 hero token 會讓 hero 外變數未定義 →
**整條宣告失效 → `border-style` 回到 `none`**,而後面針對列表的規則只覆寫 `border-color`,
補不回 `border-style`。改為新增 hero scope 的一條:

```css
.intro-header .tags .tag { border-color: var(--hero-border); }
```

### 4. 導覽列 token 與 popup 正規化(決策 5)

```css
.navbar-custom {
  --navbar-fg: #fff;
  --navbar-fg-hover: rgba(255, 255, 255, 0.8);
}
```

**consumer 正面列舉,不用包含式 selector。** `.navbar-tools button` / `.navbar-tools svg` 也會
命中 HeadlessUI 選單**裡面**的元素(選單行內渲染於 `.navbar-tools` 子樹)。實測後果:選單項的
focus 態是 `bg-primary-600 text-white`,而 `--color-primary-600: #4db8d1`;`text-white` 沒有
`!` important,所以未分層規則會壓過它 —— text 模式下對比降到**淺 4.49 / 深 1.75**。這個 bug
目前潛伏,因為 `.navbar-tools button` 現在給 `#fff`、與 `text-white` 同值。

CSS 裡的 `[role='menu'] button`(字體)與 `[role='menu'] svg { color: inherit }`(圖標)就是為了
同一類污染而存在的補償規則;而 fixed 狀態的 `.navbar-custom.is-fixed .navbar-tools svg`
(0,3,1)又壓過 `[role='menu'] svg`(0,2,1),所以補償在 fixed 狀態下失效。

**正規化做法:**

1. 三個真正的頂欄 trigger(ThemeSwitch 的 `MenuButton`、SearchButton 的按鈕、MobileNavMenu 的
   `MenuButton`)加上共用語意 class **`.navbar-tool-trigger`**。加 class 而非在 CSS 列舉三個
   不相關的既有 class 名,正是為了消除這種脆弱性。
2. token consumer 限定為:`.navbar-brand`、`.navbar-links a`、`.navbar-tool-trigger`
   (及其 `svg`,用 `currentColor`)、`.icon-bar`(注意是 `background`)。
3. **刪除**廣域 `.navbar-tools button` / `.navbar-tools svg` 的顏色宣告、`[role='menu']` 的顏色
   補償規則、以及 `.is-fixed` 兩組裡針對 `.navbar-tools button/svg` 的 descendant 顏色宣告。
4. **popup 自己的可及配色**:focus 態改用 `--hux-interactive` 當背景 + 白字 = **6.49**(取代
   `bg-primary-600` 的 2.31)。淺/深主題皆通過,因為背景是 focus 色本身而非面板色。

```css
@media (min-width: 768px) {
  .navbar-custom.is-fixed {
    --navbar-fg: #2d2d2d;
    --navbar-fg-hover: #2d2d2d; /* 等值:複製「fixed 狀態 hover 不變色」的現況 */
  }
  .dark .navbar-custom.is-fixed { --navbar-fg: #fff; --navbar-fg-hover: #fff; }
}
```

`--navbar-fg-hover` 若漏掉就**不是等值替換**:目前淺色 fixed navbar 文字 hover 時仍是深色,
純粹因為 `.navbar-custom.is-fixed .navbar-brand`(0,3,0)壓過 `.navbar-brand:hover`(0,2,0)。
收斂成祖先變數後,後者重新生效並讀到基底的 `rgba(255,255,255,.8)` —— 疊在 90% 白底上就是
白底白字。

**刻意不抽 `--navbar-bg` / `--navbar-border`**:本功能沒有 consumer(text 模式的導覽列背景維持
透明),抽出來只會是死 token;border 另有「基底加 transparent 1px 會憑空多出高度」的風險。

### 5. 一般互動色 token

navbar 與 text hero 都需要「可讀的互動色」,但**不該直接依賴系列專用的 `--series-interactive`**
—— 否則將來改系列配色會連動導覽列。加一層指向:

```css
:root { --hux-interactive: #00677d; }
.dark { --hux-interactive: #66c7e0; }
--series-interactive: var(--hux-interactive); /* 值不變,零像素 */
```

### 6. text 模式 CSS

```css
.intro-header-text {
  background: none; /* shorthand 一併把 background-color 重置為 transparent,清掉 #777 */
  --hero-fg: var(--hux-text);
  --hero-border: var(--hux-text);
  --hero-link-hover: var(--hux-interactive);
}

/* Hux 的 style-text 在所有斷點都是 85/20。padding 不是變數,仍需權重:
   單一 class 會跟桌面規則 .intro-header-post .intro-header-content(0,2,0)平手而輸在順序。 */
.intro-header-post.intro-header-text .intro-header-content { padding: 85px 15px 20px; }

.intro-header-text .tags .tag:hover { background-color: rgba(0, 0, 0, 0.05); }
.dark .intro-header-text .tags .tag:hover { background-color: rgba(255, 255, 255, 0.08); }
```

**tag hover 必須有深色變體。** Hux 的 `rgba(0,0,0,.05)` 是淺色專用;深色模式往 `rgb(45,45,45)`
疊 5% 黑會**更暗**,回饋消失。本 repo 既有慣例正是為 hover 底色寫深色變體
(`.dark #tag_cloud .tag:hover`)。

實測對比(WCAG,對實際底色):

| 顏色 | 淺色底(白) | 深色底(`#2d2d2d`) | 判定 |
| --- | --- | --- | --- |
| `--hux-text` | 10.36 | 10.43 | 通過 |
| `#66c7e0`(原釘死值) | **1.94** | 7.08 | 淺色不合格 |
| `--hux-interactive` | 6.49 | 7.08 | 通過 |
| `#0085a1`(Hux invert hover) | **4.31** | **3.19** | 皆不合格,不採用 |
| 白字對 `#4db8d1`(popup 現況) | **2.31** | **2.31** | 皆不合格,由決策 5 修掉 |

### 7. 導覽列 tone(`:has()`)

`<Header />` 與 `<main>{children}</main>` 是**兄弟節點**,拿不到 frontmatter。資訊在下、需求
在上,React 單向資料流無 prop 路徑可走。`:has()` 讓瀏覽器做反向查詢,純宣告式:DOM 一變樣式
立刻跟著變,無 effect、無時序、無殘留狀態。

```css
/* 桌面:fixed 有自己的實心底,text tone 只在非 fixed 時套用 */
body:has(main .intro-header-post.intro-header-text) .navbar-custom:not(.is-fixed) {
  --navbar-fg: var(--hux-text);
  --navbar-fg-hover: var(--hux-interactive);
}

/* 手機:JS 在所有 viewport 都會加 is-fixed,但手機沒有 fixed 視覺狀態(那組規則全在
   min-width:768px 內),導覽列始終是 position:absolute 的透明疊層。因此不能被 is-fixed
   排除,否則捲動回頂端途中(scrollY 僅數 px、導覽列已部分可見而 is-fixed 尚未移除)
   會是白字白底。 */
@media (max-width: 767px) {
  body:has(main .intro-header-post.intro-header-text) .navbar-custom {
    --navbar-fg: var(--hux-text);
    --navbar-fg-hover: var(--hux-interactive);
  }
}
```

加 `.intro-header-post` 限定:只有文章 hero 會切換 tone,正文 raw HTML 出現同名 class 不會誤觸,
並自然排除首頁與 archive。**刻意不用 `main > article > ...` 的直接子選擇器鏈** —— 那會把 CSS
綁死在確切 DOM 嵌套上,日後多包一層 wrapper 就**靜默失效**(tone 不再套用且無任何錯誤)。

`:not(.is-fixed)` 在桌面是必要的:`:has()` 權重等於其參數,整條是 (0,4,2),會壓過
`.navbar-custom.is-fixed` 的 (0,2,0)。用 `:not()` 讓兩者以 class 互斥,比賭權重穩健。

## Cascade layer 硬性約束

`css/tailwind.css` 的 `@layer base` 與 `@layer utilities` 之後**全部未分層** —— 包含所有 navbar
與 hero 規則。Tailwind v4 把工具類放進 layer,而**未分層作者樣式贏過任何 `@layer` 內規則,與
specificity 無關** —— 但這**只適用於 normal declaration**;`!important` 會反轉 layer 順位
(這正是元件裡 `text-gray-700!` 那個 `!` 目前能生效的原因)。因此:

- 所有新規則**必須留在未分層區**。包進 `@layer components` 會被任何 Tailwind 工具類蓋掉,
  失敗模式極隱晦:DevTools 看得到規則且未被劃掉,是輸在 layer 順位而非權重。
- 推論:本文件所有 specificity 元組**只在同層前提下有意義**。
- 決策 5 刪掉廣域 `.navbar-tools svg` 之後,`SearchButton` 上原本被靜默蓋掉的
  `text-gray-900 dark:text-gray-100` 會**復活**。這是預期行為(popup/trigger 交還元件控制),
  但必須在 commit C 的截圖比對中確認結果正確,並清掉不再需要的類別。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `contentlayer.config.ts` | `headerStyle` enum 欄位;`onSuccess` 改呼叫 orchestration |
| `lib/hero-config.ts` | 新增:`parseHeaderStyle()`、`validateHeroConfiguration()`、domain parsing |
| `lib/hero-mode.ts` | 新增:`resolveHeroSurface()` |
| `lib/content-outputs.ts` | 新增:`runContentDerivedOutputs()`(可注入依賴) |
| `components/hux/HuxHero.tsx` | 改用 `resolveHeroSurface`;加 `intro-header-text`;text 模式不產生 inline `style`、不渲染遮罩 |
| `layouts/PostLayout.tsx` | 多解 `headerStyle` 並傳給 `HuxHero` |
| `components/ThemeSwitch.tsx` / `SearchButton.tsx` / `MobileNavMenu.tsx` | 加 `.navbar-tool-trigger`;popup focus 配色改用 `--hux-interactive`;清掉失效類別 |
| `css/tailwind.css` | hero token、navbar token 與 popup 正規化、`--hux-interactive`、text 模式、`:has()` |
| `data/blog/hidden/2026-07-30-header-style-text-test.md` | 新增,全 ASCII,正文含一條 internal markdown link |
| `tests/unit/hero-config.test.ts` | 新增:`parseHeaderStyle` 與 validator 錯誤路徑 |
| `tests/unit/hero-mode.test.ts` | 新增:優先序窮舉表 |
| `tests/unit/hero-rendering.test.ts` | 新增:static rendering 契約 |
| `tests/unit/content-outputs.test.ts` | 新增:orchestration + config wiring |
| `tests/playwright/header-style-text.spec.ts` | 新增 |
| `tests/playwright/helpers/color.ts` | 新增:唯一的 parser/compositor(見驗證章) |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都加 `headerStyle` + 互斥規則 + OG 策略 |
| `README.md` | 功能清單一行 |
| `tests/playwright/series.spec.ts` | 只改註解措辭:「Hero 永遠是深色照片」→ 限定為「此 image hero fixture」 |

**inline style 是不可繞過的約束**:`HuxHero` 把背景寫成 inline `style`,inline 贏過任何 class
規則。純 CSS **蓋不掉** `backgroundImage` 的 fallback,故 text 模式必須讓元件根本不產生 `style`。

`next-env.d.ts` 一律排除,commit 用明確的 `git add <檔案清單>`。

## 驗證

### CI 覆蓋範圍的硬限制

必過的 `ci` job 只跑 `contentlayer2 build`、`eslint`、`tsc --noEmit`、`test:unit`。
**Playwright(`test:parity`)不是 CI gate。** 因此核心契約必須落在 unit / static-rendering 層;
Playwright 只負責真實瀏覽器才能驗的東西(計算色、對比、幾何、捲動狀態)。出貨前必須手動跑
`yarn test:parity` 全綠並在 PR 描述記錄結果。

### Unit

**`hero-config`**:`parseHeaderStyle` 對 `txt`、空字串、純空白字串必須失敗(釘死 P0 —— schema
`enum` 不提供這個保護);validator 對每種衝突欄位組合的錯誤訊息;**`headerMask: 0` 必須被視為
有效值而觸發衝突**。只靠「真實 build 裡沒有衝突的 fixture」無法證明錯誤路徑守得住 —— 那條路徑
永遠不會被執行到。

**`hero-mode`**:窮舉 `iframe × headerStyle × headerBgCss × headerImg`:

- `iframe` + `text` → `keynote`;`text` + `headerImg`/`headerBgCss` → `text`
- `headerBgCss` 帶尾隨分號 → 清理後的值(補上目前只有註解保護的 SPA 修復)
- 未填 `headerImg` → `image` + fallback URL + **`fallbackColor: '#2D2D2D'`**
- 明填同一 URL → `image` + 同 URL + **`fallbackColor: null`**
- commit A:遮罩行為與現況逐項相同;功能 commit:`text` → `maskOpacity === null`

**`hero-rendering`**(static rendering,`renderToStaticMarkup`):覆蓋
**`PostLayout` → `HuxHero` 的 prop 接線**,用手工建構的 `content` object。**不含 Contentlayer**
—— 改為 import generated fixture 會讓 `test:unit` 依賴先跑 `contentlayer2 build`,引入測試順序
耦合。斷言:text 模式帶 `intro-header-text`、**無 `style` 屬性**、**無 `.header-mask`**;
text + series 的 markup 正確;圖片模式仍帶 inline `style`。

**`content-outputs`**:驗證失敗時 collect/tag/search 的呼叫數全為 0;`createTagCount` 確實被
await;**以及 `contentlayer.config.ts` 真的呼叫了 orchestration**(否則有人移除呼叫,helper
單測仍全綠)。

### 顏色 helper 的唯一責任與適用邊界

只保留**一個**純 parser/compositor(`tests/playwright/helpers/color.ts`),不要把 alpha 責任
分散到兩個檔案。現有 `relativeLuminance` 用 `.match(/\d+/g)?.slice(0, 3)` —— **直接丟掉 alpha**,
會把 `rgba(0,0,0,.05)` 當純黑。

必須有 golden tests:兩層半透明合成、淺/深 opaque base、alpha 0 與 1、已知手算 RGB 與對比值。
**不支援的格式必須明確拋錯** —— 目前的數字 regex 會把 `oklch(0.656 0.241 354.308)` 誤讀成
RGB(本 repo 的 primary 色階多為 oklch)。

**適用邊界必須寫清楚,不可宣稱是通用的「實際觀察色」:**

| 情境 | 方法 |
| --- | --- |
| 巢狀色面(tag hover 疊在 hero 疊在 body) | 沿**祖先鏈**逐層 alpha 合成至第一個不透明背景 |
| 疊層元素(navbar `position:absolute` 覆在 hero 上) | hero 是**兄弟子樹不是祖先**,祖先鏈看不到它 → 呼叫端必須**明確傳入 backdrop 元素** |
| 圖片背景 | CSS 算不出來 → 只能像素量測,或**限制測試契約**:image hero 的導覽列只做關係型斷言(brand `===` 白),不做對比數值 |

### Playwright 狀態表(不可寫成笛卡兒積)

斷言並非每格都適用,硬套會逼出 `if (isVisible)` / `.count()` 防衛式判斷 —— 那是假綠溫床。

| 狀態 | 驗證 | 不適用 |
| --- | --- | --- |
| mobile / top | brand、ThemeSwitch 圖示、`.icon-bar`、hero 全部元素 | `.navbar-links`(`display:none`) |
| mobile / near-top-with-`is-fixed` | navbar 仍套 text tone | hero(已捲出) |
| mobile / 展開漢堡 + focus `Search` | popup focus 對比 ≥ 4.5 | — |
| desktop / top | brand `===` body 色、`.navbar-links`、文字版 ThemeSwitch、搜尋 SVG、hero 全部元素 | `.icon-bar`(`display:none`) |
| desktop / top + 展開 ThemeSwitch | popup focus 對比 ≥ 4.5 | — |
| desktop / fixed-visible | fixed 前景、**hover 等值**、**展開 ThemeSwitch 的 popup 對比** | 「brand `===` body 色」**刻意不成立** |
| desktop / fixed-hidden(`top:-61px`) | 只驗 class/state,**不做 hover** | 元素不可見,hover 會失敗 |

每個狀態各跑淺/深兩輪,且只重跑該狀態可見的元素。

三個陷阱:fixed navbar 向下捲時在 `top: -61px`,必須先向上捲取得 `is-visible` 才可見,否則
`hover()` 會因不可見而失敗(不是因為顏色錯);手機「捲動後」與「捲回接近頂端」是兩個不同狀態;
**手機 popup 的 mutation 必須明確 focus `Search` 按鈕** —— 其他選單項是 `<a>`,抓不到 button
相關的回歸。

### 關係型與方向性斷言

- text 文章 h1 色 `===` `body` 計算色;**對照組**:圖片文章 h1 `===` 白(證明有鑑別力)
- 導覽列品牌色在 text 文章 `===` body 文字色、在圖片文章 `===` 白
- 主題切換前後同一元素顏色**必須不同**(證明真的吃變數而非抄了硬值)
- text 文章 hero `background-image` 為 `none`;圖片文章不為 `none`
- 桌面斷點 `.intro-header-content` 上下 padding 為 85/20 而非 150
- text 模式不渲染 `.header-mask`
- **hero 外 tag 邊框仍可見**:locator **只用 post-card 的 tag**(實測側邊目錄與文章正文都沒有
  tag producer,不要為不存在的 locator 寫 count-based 跳過)。**不可只斷言 `border-color`** ——
  shorthand 失效時針對列表的 `border-color` 仍生效、computed 值照樣有,只有 `border-style` 變
  `none`、`border-width` 變 `0px`。必須同時斷言 `border-style !== 'none'`、四側 width > 0、
  border 對背景 ≥ **3:1**(非文字用 WCAG 1.4.11,不是 4.5)
- **fixed navbar hover 等值**:直接斷言 `hoveredColor === restingColor`(比「對比合格」強,
  後者抓不到 `#2d2d2d` 漂到 `#333`)
- **tag hover 拆兩契約**:可讀性(合成後文字對有效背景 ≥ 4.5)與 hover 回饋(淺色底色**變暗**、
  深色底色**變亮**,方向性)。合成後實際差異僅 1.12:1 / 1.29:1,本來就不該以 4.5 判定
- **SPA client navigation**:text 文章 → 圖片文章 → 瀏覽器上一頁。兩個前提必須先備妥:
  fixture 沒有 pager/series,所以正文必須放一條 internal markdown link(MDX 已映射到 Next
  `Link`);且必須設一個 `window` marker 並在點擊後確認它還在 —— 發生 full reload 時 URL 與
  樣式斷言**一樣會通過**,而 full reload 恰好繞過這條測試要驗的東西

### series 連結的 hover 與 focus oracle

hidden fixture 進不了系列(series 收集會跳過 `listed === false`),所以**真實 text fixture 頁面
上沒有 `.series-meta` 元素**。補一層 **CSS consumer harness**:在真實 text fixture 的
**`.intro-header-text .post-heading` 內**注入同形元素(harness 必須放進正確的祖先鏈內,不是
hero 任意位置,否則選擇器根本不匹配)。

**注入時必須用完整的真實 class list**:`post-series-link post-series-link-top series-meta`。
省略 `.post-series-link-top` 會製造 production 不存在的 cascade。

與被否決的做法相反:那個方案把**模式 class** 注入 image hero(背景仍是 inline style 的圖片,
量到的沒意義);這裡是把**內容元素**注入真正的 text hero(背景、token、cascade 全是真的)。

**oracle 分工必須寫清楚,否則會對錯目標。** 刪掉 hero 專屬 consumer **不會**讓 text 模式變色 ——
`.post-series-link-top a:hover` 有 `color: var(--series-interactive)`,而 text 模式的
`--hero-link-hover` 就是它,遞補後同值。

| oracle | 守什麼 |
| --- | --- |
| text CSS harness | `--hero-link-hover` **沒被改回硬編碼 `#66c7e0`**(淺色對比 1.94 → 紅);且 `hovered !== resting` |
| text CSS harness(**focus**) | 以**鍵盤** focus,驗可讀性與 `focused !== resting` |
| **既有** image-series E2E | hero **專屬 consumer 沒被刪除**(遞補值隨主題變 → 既有的「兩主題 hover 同色」直接紅);並補 **image hero 的 focus 色在兩主題一致** |

`:focus` 目前**完全沒有 oracle** —— 規則宣告 hover+focus,但兩邊測試都只測 hover,只刪 focus arm
全部照樣綠。上表的兩條 focus 契約專門補這個缺口。

### 突變測試矩陣

| 突變 | 應變紅 |
| --- | --- |
| `parseHeaderStyle` 移除(只靠 schema enum) | `txt` 的單元測試 |
| validator 不擋 `headerMask`,或用 truthy 判斷 | `headerMask: 0` 的錯誤路徑 |
| validator 移到 writer 之後 | orchestration 呼叫數 |
| 移除 `await createTagCount()` | orchestration await 斷言 |
| 從 config 移除 orchestration 呼叫 | config wiring 斷言 |
| 元件不再短路 inline style | hero `background-image` 為 `none` |
| `image` 模式丟掉 `fallbackColor` | 未填 `headerImg` 的 fallback 底色 |
| 刪掉 470 行的 `.series-meta` consumer | image hero 的 series 句子不得變 `#666` |
| **只刪 hover arm** | 既有「兩主題 hover 同色」 |
| **只刪 focus arm** | **text harness 與 image hero 的 focus 契約** |
| `--hero-link-hover` 改回硬編碼 `#66c7e0` | text harness 的淺色 hover 對比 |
| 刪 `.dark ... .tag:hover` | 深色 tag hover **方向性**(不是 4.5) |
| 把全域 tag `border` shorthand 改成消費 hero token | post-card tag 的 `border-style`/`width` |
| 刪整條 `:has()` 規則 | 導覽列品牌色關係斷言(明/暗 × 手機/桌面) |
| 刪 `@media (max-width: 767px)` 那條 | 手機「捲回接近頂端」的可讀性 |
| 拿掉 `:not(.is-fixed)` | 桌面捲動後浮動列顏色 |
| `is-fixed` 漏 `--navbar-fg-hover` | fixed navbar hover 等值 |
| fixed 的 `--navbar-fg-hover` 從 `#2d2d2d` 漂到 `#333` | 同上 |
| navbar token 改回用 `.navbar-tools button` | 展開選單後 focus 選單項的對比 |
| popup focus 改回 `bg-primary-600` | popup focus 對比(2.31) |
| `var(--hux-text)` 改成 `#404040` | 深色 h1 對比 + 「切換主題顏色要變」 |
| 覆寫降成單一 class | 桌面 padding 85/20 |
| 顏色 helper 丟掉 alpha | golden tests |
| 顏色 helper 接受 `oklch()` 當 RGB | golden tests 的明確拋錯 |

### production 目視驗收

`yarn build` → 綁 `127.0.0.1:3012`(**驗證後必須關閉該程序**)。CLAUDE.md 明令互動驗證不得用
dev server(冷路由首次點擊 ~1.5 秒是按需編譯)。

- 兩主題 × mobile/desktop 截圖
- 兩個捲動狀態,含手機「捲回接近頂端」
- 手機展開漢堡、桌面展開 ThemeSwitch,含 focus 態
- **在頁面上實際切換主題**(非重載),確認顏色即時跟著變
- 用 `getComputedStyle` 量實際值,不從 CSS 原始碼推論

### 字型預算

fixture 內容(標題、副標、tags、正文)**刻意全 ASCII**。`site-font-text.mjs` 的 `markdownFiles`
會遞迴進 `hidden/`,hidden 文章一樣計入預算;ASCII 全在 `PRINTABLE_ASCII` → 進 core → 新頁面
碰桶數為 1,零新增 bucket、零產物重生成。完成後跑 `yarn check:site-font --full`(CI 的必過
`check` job 跑的正是 `--full`)。

## Commit 序列

原則:等值重構各自獨立(用既有測試組當守門員);**功能本身必須是原子的**;**手冊與功能同 commit**
(`AGENTS.md` 提交前檢查清單第 1 項明訂)。

| # | 內容 | 驗收 |
| --- | --- | --- |
| A | `lib/hero-mode.ts` + 窮舉表單元測試 + `HuxHero` 接線 | 不碰 CSS;既有測試組全綠 |
| B | hero 顏色 token + 繼承化 + hero-scoped tag 邊框 + `--hux-interactive` 指向 | **零像素變動**;驗證閘是**搜尋整份 CSS**;含 post-card tag 邊框回歸測試 |
| C | navbar token 正面列舉 + `.navbar-tool-trigger` + **popup cascade 正規化** + popup focus 配色 | **刻意有像素變動**(popup 交還元件、focus 2.31 → 6.49);含 fixed hover 等值與展開選單的 focus 對比測試 |
| D | `parseHeaderStyle` + validator + orchestration seam + 其單元測試 | 錯誤路徑全覆蓋;既有測試組全綠 |
| E | **原子功能 commit**:`enum` 欄位 + text surface CSS + navbar tone + fixture + static/E2E 測試 + **兩份手冊 + README** | 不得拆成「text hero」與「navbar tone」兩個可部署 commit |
| F | `series.spec.ts` 註解措辭 + CLAUDE.md／AGENTS.md 教訓 | — |
| G | OpenWiki 重生成 | 生成頁差異已 review |

**A、B、D 的驗收是「改了很多行、輸出零像素差異」**,任一步有位移就停手 —— 等值替換不等值。
**C 刻意不是零像素**,必須逐一截圖說明每一處變動的理由。

**E 不可再拆**:Vercel 部署 main 的每個 commit。若 text hero 先落地而 navbar tone 在下一個
commit,中間會有一個 production 狀態是白字白底。

**自檢**:E 的 diff 若出現任何十六進位色碼,代表 B/C 沒做乾淨,先停下檢查。

B/C 的比對範圍:圖片文章、首頁、archive、series、about、404、offline、**文章列表卡片**。

**OpenWiki 流程,順序不可顛倒:**

1. 改 source / tests / 手冊(A–F)
2. **先 commit**(noop 判斷要求乾淨工作樹,髒的話一律做完整付費重生成)
3. **從已提交的 A–F 建一個乾淨 worktree**,在那裡執行 —— `next-env.d.ts` 會反覆翻動而守則同時
   禁止 checkout 還原與 gitignore 它,所以主工作樹**永遠不會是乾淨的**
4. 跑 `openwiki code --update --print`(**必須帶 `--print`**,本專案唯一支援的完整命令)
5. review 生成差異並納入同一個 PR

## 已否決/延後

- **`@supports not selector(:has(*))` 保險** —— 官方文件確認 Tailwind v4 最低要求
  Chrome 111 / Safari 16.4 / Firefox 128,而 `:has()` 支援起始為 105 / 15.4 / 121,**三者皆低於
  Tailwind 門檻**。任何能渲染本站的瀏覽器都已支援 `:has()`,該分支永遠不會執行。永遠不執行、
  只能靠造假驗證的分支比沒有分支更糟。
- **React Context 傳遞 `headerStyle`** —— 首屏 SSR 時 context 為空,白字先渲染再翻深色(會閃);
  站內導覽依賴 effect 時序。這正是 `HuxHero` 註解記錄的「站內連結進來背景消失」同類失敗模式。
- **把 `<Header />` 移出 root layout** —— 要動七條以上路由且導覽列從此重複,**增加**維護風險。
- **`layout` 值正規化 / capability registry** —— 現有 16 篇的 `layout` 全是 `post`(14) 與
  `keynote`(2),route 的 map 只認 `PostLayout`/`PostSimple`/`PostBanner`,**每一篇都靠 unknown
  fallback**。真實隱患,但修它要決定 `keynote` 映射到什麼(內容行為決策)且影響全部 16 篇。
  另案,見 memory `unused-starter-layouts`。
- **`data-navbar-tone` 語意屬性** —— 限縮到 `main` + `.intro-header-post` 已解決範圍過寬的實際
  風險;引入平行屬性會多一個真相來源。等出現第二種 page chrome tone 再升級。
- **`--navbar-bg` / `--navbar-border`** —— 本功能無 consumer,抽出來只是死 token。
- **全域 focus outline 顏色** —— 同一顆青色、白底 2.31,低於非文字 3:1。是第三件事,獨立處理。
- **publication policy** —— PR1。

## 已知未處理問題(刻意留下)

1. **`layout: PostSimple` / `PostBanner` 無人使用但可達。** 與 `headerStyle` 的組合由 validator
   在 build 時拒絕,但那是 **denylist** —— 未來新增其他不 render `HuxHero` 的 layout 仍會漏掉。
2. **keynote(`iframe`)+ `headerMask` 會把遮罩渲染在 iframe 上**,可能阻擋點擊。既有行為,
   commit A 必須零行為改變,未觀察到有文章使用該組合。
3. **`text` + `images` frontmatter 時 JSON-LD 仍會用 `images[0]`。** `images` **不是**自動 OG
   社群圖欄位 —— 依手冊它是 JSON-LD `image` 的 fallback(順位在 `headerImg` 之後)與
   `PostBanner` 版面的背景來源,與自動產生的 `og:image`/Twitter 卡片無關。不影響 hero,刻意不擋。
4. **series + text 沒有真實內容路徑的測試覆蓋**(hidden fixture 進不了系列),僅有 CSS consumer
   harness。若日後有真實文章同時用系列與 text 模式,應補真實路徑測試。
