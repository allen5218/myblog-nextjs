# Mermaid 管線:環境陷阱與不變量

> **什麼時候該讀這份**:動到 `scripts/mermaid-*.mjs`、`lib/rehype-mermaid.mjs`、
> `public/mermaid/` 的產物、mermaid 相關測試,或排查「圖沒出來 / 圖跑掉」時。
> 純粹在文章裡寫 mermaid fence **不需要**讀 —— 該擋的都有測試機器強制。
>
> 從 `AGENTS.md` 搬出來(2026-08-02)。它是**每 session 必在場**的祈使守則,
> 而這些是**按需**的子系統知識;混在一起會讓每個 session 都付不相關的閱讀成本。
> 機制性的描述(管線怎麼運作、契約是什麼)在
> [`openwiki/operations/runbook.md`](../../openwiki/operations/runbook.md);
> 這份只放**踩過的坑與必須遵守的規則**。

- Mermaid 渲染需 headless Chromium,**不能在 Vercel build 跑**;offload 到
  `yarn mermaid:render`,雙主題 SVG 快取 commit 在 `public/mermaid/`。**任何會跑渲染的新
  workflow 記得 `yarn playwright install --with-deps chromium`**。
- **任何影響渲染輸出的改動**(升級 mermaid、改 `LIGHT_THEME`/`DARK_THEME`、改
  `normalizeSvg`,或改 render 邏輯中**會改變輸出**的部分 —— 純驗證關卡的例外見下)
  都要 bump `scripts/mermaid-shared.mjs` 的 `CACHE_VERSION`,
  再重跑 `yarn mermaid:render` 後 commit。**這是唯一防線**:`mermaid-check` 改成結構檢查後
  (見下)不再比對 SVG 內容,只要 hash 沒變、檔案還在就綠燈 —— 忘了 bump,過時的 SVG 會
  悄悄留著、CI 抓不到。升級 mermaid 後另外**目視**確認幾張圖(結構檢查不會替你發現輸出跑掉)。
- `mermaid-check` 是**警告級非必過**檢查(純結構 hash 比對、刻意不重新渲染,故不需
  Chromium、也跨平台穩定)。它**抓不到過時的 SVG** —— 那是上一條 `CACHE_VERSION` 的責任。
- **mermaid fence 靜默退化成程式碼區塊**時(全都不報錯,是刻意的優雅降級),先照
  `openwiki/operations/runbook.md` 的四點排查(忘了 render / `.contentlayer` 快取卡住 /
  寫成 `mermaid:標題` / fence 不在 `data/blog`),**不要直接當渲染 bug 追**。
- **產品端是用 `<img src>` 引 SVG,所以那些 SVG 必須是合法 XML。** `<img>` 載入的 SVG 走
  **嚴格 XML 解析**,一個裸 void element 就讓整份文件解析失敗:圖塌成沒有固有尺寸的細線,
  但**請求是 200、沒有 console 錯誤、`mermaid-check` 照樣綠燈**(它不解析輸出)。
  2026-07-25 踩過:節點標籤寫 `<br/>` 做多行,mermaid 會把它序列化成裸 `<br>` 塞進
  foreignObject,圖就這樣一路上了 production。`normalizeSvg` 現在會把裸 `<br>` 補成自閉合,
  `mermaid-render.mjs` 也在 render 當下用同一顆瀏覽器的 `DOMParser` 擋(不合法就直接丟錯)。
  **診斷「mermaid 顯示不了」時第一個看 `img.naturalWidth`** —— 0 就是 SVG 沒被瀏覽器接受,
  不是 CSS 或路徑問題;它塌成細線而不是破圖,所以肉眼很容易誤判成「圖沒出來」。
  回歸測試在 `tests/playwright/mermaid.spec.ts`(必須同時涵蓋各圖種測試文**和**含多行標籤
  的文章 —— 前者沒有 `<br/>`,單靠它抓不到)。
- **HTML 的 `width`/`height` 內容屬性是非負整數,而 mermaid 的 viewBox 幾乎都是小數**
  (現有 10 組有 7 組至少一軸是小數)。寫進 `<img>` 屬性前一定要 `Math.round`,不要依賴
  瀏覽器對非法值的容錯行為。因此**驗證「尺寸可用」必須看取整後的值**:`width="0.4"` 原始值
  大於 0,取整卻是 `0`,一樣保留不了版位。代價有兩層:①載入前後最多約 0.889px 的次像素
  更新(實測那張是 0.7px),所以幾何斷言的容差**不能設 1px**,那只剩 0.11px 餘裕會隨機
  假紅;②圖的最終渲染寬度**永久**比取整前多最多 0.5px(`width` 屬性成為 used width),
  這不是暫態。兩者都在次像素等級,是刻意接受的取捨。
- **`mermaid-check` 只比對檔名,「檔案在、根標籤沒有合法尺寸」這種狀態它完全不會回報。**
  所以那個情況在 producer(`mermaid-render.mjs` 寫檔前)與 consumer(`rehype-mermaid.mjs`)
  **兩端都 fail-loud**,只有 `ENOENT` 才退化成程式碼區塊(缺檔有 `mermaid-check` 兜底)。
  兩端刻意共用 `parseSvgRootDimensions`:各用一套 parser 會出現「producer 過關、consumer
  仍解析失敗」的縫隙,producer 的保證就只是第二意見。
- **`rehype-mermaid` 丟出的錯誤會被 contentlayer 包成「possibly a bug in Contentlayer」。**
  它走 `UnexpectedMarkdownError` → `FetchDataError.UnexpectedError`,category 是 `Unexpected`,
  所以標頭會叫你去 Contentlayer 開 issue —— **真正的訊息(含快取檔案路徑)在明細行**。
  看到那個標頭先往下讀,不要真的去開 issue。這條路徑每個 PR 都會執行(必過的 `ci` job
  跑 `yarn contentlayer2 build`)。
- **`CACHE_VERSION` 的 bump 規則有一個例外:純驗證關卡不必 bump。** 規則字面寫「改 render
  邏輯」要 bump,但它自陳的目的是「任何**影響渲染輸出**的改動」。在 `mermaid-render.mjs`
  加一道不改變任何 SVG bytes 的驗證(例如根尺寸檢查)不影響輸出,bump 反而會逼 20 張圖
  在不同機器/日期重生成,製造真正的假 diff。
- **靜態 gantt 一律要寫 `todayMarker off`。** 圖是 build 時渲染的,mermaid 預設的「今天」
  會凍結在渲染那一刻,從隔天起就對讀者說謊,而 `mermaid-check` 不讀內容抓不到。
  `tests/unit/mermaid-gantt-contract.test.ts` 掃全 `data/blog` 強制這條。
- **量 mermaid 圖載入行為的 Playwright 測試,context 必須設 `serviceWorkers: 'block'`。**
  站台的 service worker 對 `.svg` 掛 StaleWhileRevalidate(`app/sw.ts` 展開 `...defaultCache`),
  而 Playwright 預設是 `'allow'` —— 不 block 的話量到的是 SW 快取行為而不是 markup,
  且 SW claim client 與首次影像請求是競態,結果會時好時壞。
- **要從本管線產出的 SVG(或一般 HTML)取結構化資訊,用 `hast-util-from-html-isomorphic`
  解析,不要自己寫 regex。** 它與 `unist-util-visit` 都已是直接依賴,不新增相依。
  2026-08-02 在 gantt 的 today marker 斷言上連續寫壞三版,每一版都被合法輸入穿透,
  而且含**假綠**:①精確字串比對被 `class="today marker"` 繞過;②單一 regex 找 `class=`
  因為 `[^>]*` 是 greedy 會回溯到最後一個,抓到屬性值裡的假 class;③逐標籤掃描則被
  實體編碼 `class="to&#100;ay"` 穿透(這個是**管線可達**的),以及
  `<?pi <!-- ?>…<?pi --> ?>` 這種剝除會吃掉真元素的合法 XML(這個不可達,因為前置 PI
  過不了 producer 的根標籤錨定)。根本問題是**剝除 XML 結構本身就需要理解 XML 結構**,
  每補一個 pattern 只是把邊界往外推。
  **但它是 HTML parser、不是 XML parser**:`<g CLASS="today"/>` 在 XML 裡沒有 class token,
  它卻會正規化成 `className: ['today']`(假紅,方向安全)。需要精確 XML 語意時要另找工具。
- **只改 `public/mermaid/` 的 SVG 而不動 markdown,`.contentlayer` 會沿用快取的 HTML。**
  2026-08-01 做突變測試時踩過:patch 了 SVG 的根尺寸再重跑,`<img>` 屬性仍是舊值、
  `naturalWidth` 已是新值,於是紅在錯的斷言上,一度誤判成「那條斷言是空包彈」。
  **驗證產物層的改動要先 `rm -rf .contentlayer`**,否則實驗有未受控變數且失敗訊息不會提示。
