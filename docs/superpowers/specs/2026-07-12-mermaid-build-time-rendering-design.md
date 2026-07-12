# Mermaid 建置期雙 SVG 渲染設計

- 日期:2026-07-12
- 分支:`feat/mermaid-build-time-rendering`
- 取代前置研究:`docs/research/mermaid-build-time-note.md`(該筆記留下的「建置期 SVG」路線,本設計予以落實)

## 實作後修訂(2026-07-12)

本文以下內容是原始設計,實作時有三處刻意偏離,以此節為準:

- **共用模組移到 `scripts/mermaid-shared.mjs`**(不是本文寫的 `lib/mermaid-shared.mjs`)—
  `scripts/mermaid-render.mjs` 與 `lib/rehype-mermaid.mjs` 都從這裡 import。
- **SVG 不 inline,改為 committed 檔案 + `<img>`**:產物是 `public/mermaid/<hash>.{light,dark}.svg`
  (不是本文寫的 `data/mermaid-cache/`),rehype plugin 產出 `<figure class="mermaid-figure
  overflow-x-auto">` 包兩個 `<img src="/mermaid/...">`,不是 inline `<div>` 包 SVG 標籤。
  動機:徹底避開 SVG 屬性在 MDX/JSX 的 camelCase 對應問題,且 HTML 更小。主題切換仍是純
  CSS(依 `html.dark` 切換兩個 `<img>` 的 `display`),不受此變更影響。
- **決定性(determinism)需要額外處理**:mermaid 部分圖表型別(實測 gitGraph、
  classDiagram)排版時內部呼叫 `Math.random`,同一定義重渲染兩次會產生 bytes 不同的 SVG,
  導致 `--check` 對沒改過的圖表也一直誤報過期。渲染腳本在瀏覽器 page context 內用固定種子
  的 LCG 蓋掉 `window.Math.random`,確保「相同定義 + 相同主題」永遠逐位元組相同的輸出。

## 目標

讓部落格文章的 ` ```mermaid ` 程式碼區塊渲染成真正的圖表,並滿足三項需求:

1. **手機不壓縮** — 圖表在窄螢幕上不因網頁寬度被壓扁;過寬時出現水平滾動條(與現行表格 `ResponsiveTable` 一致的體驗)。
2. **淺/深色主題適配** — 圖表配色與網站的青色品牌色系及淺、深色模式協調。
3. **客戶端切主題同步** — 使用者用 `ThemeSwitch` 切換主題時,圖表**即時**跟著換主題。

### 非目標(YAGNI)

- 不引入客戶端 Mermaid runtime JavaScript。
- 不放寬 CSP。
- 不支援文章內互動式圖表(縮放、點擊節點跳轉等);Mermaid 產出的是靜態 SVG。
- 不改動 `mermaid: true` frontmatter 旗標的既有語意(維持相容;渲染與否由 fence 存在與否決定,不由旗標決定)。

## 核心約束與由此推導的架構

### 約束:Vercel build 跑不了 headless 瀏覽器

Mermaid 需要 DOM 量測(`getBBox` 等)才能算出 SVG,亦即渲染必須在真實/headless 瀏覽器中進行。而 Vercel 的 build container 是精簡 serverless 環境,**不提供 `sudo apt`**,無法安裝 Chromium 的系統依賴,實測會以 `libnspr4.so: cannot open shared object file` 之類錯誤失敗。

這與本專案既有的 HarfBuzz 情境**完全同型**:AGENTS.md 已記載「Vercel 上沒有 HarfBuzz,缺口由 GitHub Action 補」。因此沿用同一 pattern:**重瀏覽器渲染 offload 到 Vercel 之外(作者的 macOS / GitHub Actions runner,兩者都能取得 Chromium),Vercel build 只讀已產生的 SVG 產物。**

### 由此推導:渲染與讀取分離

| 步驟 | 在哪跑 | 做什麼 |
|------|--------|--------|
| **渲染步驟** | 作者本機 + GitHub Action(**不在 Vercel**) | `yarn mermaid:render`:掃描所有文章的 mermaid fence,用 Playwright Chromium 把每張圖渲染成淺色 + 深色兩份 SVG,以「內容 hash」為 key 寫入 committed 快取目錄。 |
| **讀取步驟** | 每次 `next build`(**含 Vercel**) | 自訂 rehype plugin 攔截 mermaid fence,算出同一個 hash,把快取的雙 SVG inline 進 HTML。快取已 commit,Vercel 永不啟動瀏覽器。 |

## 元件設計

### 1. 渲染腳本 `scripts/mermaid-render.mjs`(新增)

- **職責**:單一入口,把所有文章的 mermaid 定義渲染成雙 SVG 快取。
- **輸入**:掃描 `data/blog/**/*.{md,mdx}`(含 `hidden/`),抽出所有 ` ```mermaid ` fence 的原始文字。
- **雜湊 key**:`sha256(definition + JSON.stringify(themeConfig) + MERMAID_VERSION + RENDERER_VERSION)`。任一因素改變都會產生新 key,確保快取正確失效。`RENDERER_VERSION` 是本腳本自訂的整數常數,渲染邏輯改變時手動 bump。
- **渲染**:啟動**單一** Playwright Chromium(整批共用,不每張開一次),載入一個內嵌 Mermaid ESM 的最小 HTML page,對每個 (definition × {light, dark}) 呼叫 `mermaid.render()` 取出 SVG 字串,渲染結束關閉瀏覽器。
- **輸出**:`data/mermaid-cache/<hash>.light.svg` 與 `<hash>.dark.svg`,**commit 進 git**。
- **`--check` 模式**:重新渲染到暫存區並與 committed 快取逐一比對;有缺漏或不一致則以非零結束碼結束並列出受影響檔案(供 CI 使用)。
- **SVG 後處理**:移除 Mermaid 內嵌的 `<style>` 以外的 script(Mermaid 靜態 SVG 本就不含 script,僅防衛性檢查);為 root `<svg>` 補上 `max-width:100%` 之外**不設**固定寬度覆蓋,寬度交由第 2 節的 wrapper 控制滾動。

### 2. rehype plugin `lib/rehype-mermaid.mjs`(新增)

- **職責**:建置期把 mermaid fence 節點替換成內嵌雙 SVG 的容器,只讀快取、不啟動瀏覽器。
- **接線位置**:加入 `contentlayer.config.ts` 的 `rehypePlugins`,**排在 `rehypePrismPlus` 之前**,使 mermaid fence 在 Prism 高亮之前就被替換掉(避免被當程式碼區塊處理)。
- **比對**:走訪 `<pre><code class="language-mermaid">`,取出定義文字,算出與渲染腳本相同的 hash。
- **命中**:讀 `data/mermaid-cache/<hash>.{light,dark}.svg`,產出如下結構(見第 3 節)。
- **未命中**(作者忘了跑渲染):**優雅退化** — 保留原節點交回 Prism,顯示為普通程式碼區塊,build 不失敗。
- **同步 hash 邏輯**:hash 計算與 themeConfig 由 `lib/mermaid-shared.mjs`(新增)集中匯出,渲染腳本與 rehype plugin 共用同一份,杜絕兩邊漂移。

### 3. 前端呈現

rehype plugin 產出的節點(概念上,實際以 hast 建構):

```html
<figure class="mermaid-figure overflow-x-auto" role="img" aria-label="Mermaid diagram">
  <div class="mermaid-light"><!-- 淺色 SVG inline --></div>
  <div class="mermaid-dark"><!-- 深色 SVG inline --></div>
</figure>
```

- **滾動條**:`overflow-x-auto` 沿用 `ResponsiveTable`([components/hux/ResponsiveTable.tsx](../../../components/hux/ResponsiveTable.tsx))的既有模式;SVG 保持其原始固有寬高,過寬時容器出現水平滾動條,窄螢幕不壓縮圖形。
- **主題切換(純 CSS,零 JS)**:網站以 `next-themes` 的 `attribute="class"` 運作,深色模式即 `<html class="dark">`。在 `css/tailwind.css` 加:

  ```css
  .mermaid-dark { display: none; }
  html.dark .mermaid-light { display: none; }
  html.dark .mermaid-dark  { display: block; }
  ```

  使用者於 [ThemeSwitch.tsx](../../../components/ThemeSwitch.tsx) 切換 → next-themes 改 `<html>` class → CSS 立即切換顯示哪一份 SVG。**無 runtime JS、無延遲、無版面位移**。
- **無障礙**:`<figure role="img" aria-label>`;隱藏的那份 SVG 以 `display:none` 移出無障礙樹,避免螢幕閱讀器讀到兩次。

### 4. Mermaid 主題變數 `lib/mermaid-shared.mjs`

用 `theme: 'base'` + `themeVariables` 精調兩套,綁定既有色彩 token(主色 `#4db8d1` = `--color-primary-600`、連結色 `#0085a1`、深色底 `#111` ≈ `--color-gray-900`):

- **淺色**:白底、深灰字(對齊 `gray-800`)、青色作節點/邊框強調。
- **深色**:深色底(對齊站上 `#111` / `gray-900` 系)、淺灰字(`gray-100`)、同一支青色作強調,確保對比度足夠。

具體 `themeVariables` 數值於實作時定稿並以測試文章目視驗證;此處鎖定「`base` + 自訂變數、兩套共用同一品牌青」的方向。

### 5. 新鮮度守門:GitHub Action `mermaid-check`(新增)

- 仿 [.github/workflows/og-font-check.yml](../../../.github/workflows/og-font-check.yml):在 PR / push 時於 runner(可 `apt-get install` Chromium 依賴)跑 `yarn mermaid:render --check`。
- **警告級,不設必過**:快取不新鮮時 job 標紅提醒作者「請跑 `yarn mermaid:render` 並 commit」,但**不**加入 branch protection 的 required contexts,不擋合併(單人 repo,先保持節奏彈性;日後要升級為必過再同步改 protection 設定)。
- 因為讀取步驟對未命中會優雅退化為程式碼區塊,忘了渲染的最壞後果只是圖暫時以程式碼區塊呈現,不會壞站。

## 資料流

```
作者寫 ```mermaid fence
        │
        ├─(本機)─ yarn mermaid:render ─→ data/mermaid-cache/<hash>.{light,dark}.svg ─→ git commit
        │                                                   │
push ───┴─→ GitHub Action mermaid-check(--check,警告級)     │
        │                                                   ▼
        └─→ Vercel: next build ─→ rehype-mermaid 讀快取 ─→ inline 雙 SVG ─→ CSS 依 .dark 切換顯示
```

## 錯誤處理

| 情境 | 行為 |
|------|------|
| 渲染腳本:某圖 Mermaid 語法錯誤 | 該圖 fail,腳本印出檔案+定義+錯誤,以非零碼結束(不寫出壞 SVG);其餘圖照常。 |
| build 讀取:快取未命中 | 優雅退化為普通程式碼區塊,build 成功。 |
| build 讀取:快取檔存在但毀損/空 | 視為未命中,退化為程式碼區塊,並在 build log 印警告。 |
| CI `--check`:快取過期/缺漏 | job 標紅警告,不擋合併。 |

## 測試

- **回歸測試**(`tests/playwright/`,production build,依 AGENTS.md 除錯守則第 4/6 條):
  1. mermaid 測試文章在**淺色**模式顯示 `.mermaid-light`、隱藏 `.mermaid-dark`;切到**深色**後相反。
  2. 手機視窗寬度下,寬圖的 `figure.mermaid-figure` 出現水平滾動(`scrollWidth > clientWidth`)。
  3. 客戶端切換主題後,可見的 SVG 立即改變(不需重載)。
- **渲染腳本單元測試**(`test:unit`):hash 穩定性(相同輸入 → 相同 hash)、`--check` 對缺漏/不一致正確回報。
- 沿用既有隱藏測試文 `data/blog/hidden/2025-08-29-mermaid-v10-test.md` 作為涵蓋多種圖種(flowchart / sequence / gantt / pie / gitGraph / mindmap / timeline / class)的目視與自動化夾具。

## 文件同步(依 AGENTS.md 提交前檢查清單)

- `docs/functionality-settings-manual.zh-TW.md` 與 `docs/functionality-settings-manual.md`:更新 mermaid 行為(不再是空旗標;新增建置期渲染、雙 SVG、主題切換、滾動)。
- `README.md`:若功能清單提及圖表/Mermaid 則同步。
- `AGENTS.md`:新增環境陷阱條目 —「Mermaid 渲染需 Chromium,和 HarfBuzz 同理不能在 Vercel build 跑,offload 到 `yarn mermaid:render`(本機/GitHub Action),快取 commit 進 repo;新增會跑渲染的 workflow 記得裝 Chromium 依賴」;並記錄 `mermaid-check` 為警告級非必過檢查。
- CSP(`next.config.mjs`):**不需變動**(inline SVG 不是 script,`img-src` 也已允許,且本設計不走 `data:`/外部圖)。

## 新增/變更檔案總覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `lib/mermaid-shared.mjs` | 新增 | 共用 hash 計算 + themeVariables(淺/深)+ 版本常數 |
| `scripts/mermaid-render.mjs` | 新增 | 渲染腳本(含 `--check`) |
| `lib/rehype-mermaid.mjs` | 新增 | 讀快取、替換 fence 的 rehype plugin |
| `contentlayer.config.ts` | 修改 | 在 `rehypePrismPlus` 前掛入 rehype-mermaid |
| `css/tailwind.css` | 修改 | `.mermaid-figure` 樣式 + 主題切換 CSS |
| `data/mermaid-cache/` | 新增(committed) | 產出的雙 SVG 快取 |
| `.github/workflows/mermaid-check.yml` | 新增 | 警告級新鮮度檢查 |
| `package.json` | 修改 | 加 `mermaid:render` script;加 `mermaid`(+ 必要時 playwright 於 render 用)依賴 |
| `tests/playwright/mermaid.spec.ts` | 新增 | 主題切換 + 滾動回歸測試 |
| 兩份 manual + README + AGENTS.md | 修改 | 文件同步 |

## 待實作時定稿的細節

- `themeVariables` 兩套的精確色值(方向已定:`base` + 品牌青)。
- 渲染腳本掃描 fence 的解析方式(以 remark 解析 vs 正則抽取);傾向以 remark 解析以與 build 管線一致。
- 單一共用瀏覽器的生命週期管理細節。
