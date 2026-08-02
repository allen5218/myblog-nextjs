# Mermaid 圖表固有尺寸與渲染決定性設計

> 本文件是**規範正文 + 驗證計畫**。設計經過 Claude(claude-opus-5)與 Codex(gpt-5.6-sol,
> xhigh)三輪敵意攻防,勝出理由寫在「決策」表;被否決的做法留在「已否決」節,不散在正文。

## 背景

mermaid 圖表在 build 時渲成淺/深雙份 SVG,commit 在 `public/mermaid/`,由
`lib/rehype-mermaid.mjs` 把 mermaid fence 換成 `<figure><img><img></figure>`。

本文件解兩個獨立但同屬這條管線的問題。

### A-1:`<img>` 沒有固有尺寸 → CLS

`imgNode` 只給 `className / src / alt / loading`,CSS 是 `max-width: none; height: auto`
(沒有 width)。SVG 自己**有**尺寸(`normalizeSvg` 已把 viewBox 的寬高寫進根標籤),但
`<img>` 要到資源抵達才知道——載入前不保留版位。

### A-3:gantt today marker 讓輸出依賴系統時鐘

`data/blog/hidden/2025-08-29-mermaid-v10-test.md` 的 gantt 在**跨日期**重跑
`yarn mermaid:render` 時會改寫 today 線的 x 座標,在 `public/mermaid/` 製造假 diff。
(不是「每次重跑」—— `Math.random` 早已被固定種子的 LCG 蓋掉,同一天內重跑是逐位元組
相同的;真正的漂移驅動是 `new Date()`。2026-08-02 跨日重跑實測:修好後 20 個 SVG
逐位元組不變。)

**這不只是雜訊,是潛在的正確性 bug**:build 時渲染的 gantt 會把「今天」凍結在渲染那一刻。
現在的圖因日期範圍在 2025 年初、marker 落在 viewBox 外(`x1="8787"` vs 寬 `1264`)所以無害,
但任何日期範圍涵蓋今天的 gantt,committed SVG 會從隔天起對讀者說謊,而 `mermaid-check`
刻意不比對 SVG 內容,永遠抓不到。

## 已驗證的事實

| # | 事實 | 佐證 |
| --- | --- | --- |
| 1 | 20/20 committed SVG 的根標籤在 byte 0,`width`/`height` 等於 viewBox 第 3、4 值 | 抽樣 + Codex 全量核對 |
| 2 | 10 組尺寸中 **7 組**至少一軸是小數;`a3a246…` 兩軸皆是(`722.887 × 461.637`) | 直接讀檔 |
| 3 | today marker 是獨立一組 `<g class="today"><line … class="today"></line></g>` | 直接讀檔 |
| 4 | `todayMarker off` **只有 diagram 層級指令**,mermaid 11.16 的 `GanttDiagramConfig` 沒有全域設定 | mermaid 文件 + 安裝版原始碼 |
| 5 | SVG raw 5.5–52 KB、Brotli 1.2–5.4 KB;20 份合計約 466 KB raw / 60.8 KB Brotli | 實測 |
| 6 | `hidden: true` 是 **published-but-unlisted,production 直接 URL 可達**;該頁有 8 張圖 | 出版契約 |
| 7 | `hashDiagram` 含 `CACHE_VERSION` + 兩份主題 + 正規化定義 → 改定義即自然失效,不需 bump | `mermaid-shared.mjs:65` |
| 8 | `writeAll` 會清孤兒,但**僅在全量 render 成功後**;任一張失敗則完全不寫入 | `mermaid-render.mjs:137` |
| 9 | `mermaid-check` 只比對「預期檔名 ↔ 現存檔名」,**不讀、不解析、不比對內容** | `mermaid-render.mjs:109` |
| 10 | `app/sw.ts:40` 展開 `...defaultCache`,對 `.svg` 掛 `StaleWhileRevalidate`(`static-image-assets`) | `@serwist/turbopack` `index.worker.mjs:51` |
| 11 | `playwright.config.ts` **沒有**設 `serviceWorkers`,Playwright 預設 `'allow'` | `playwright.config.ts:14` |
| 12 | 現有 `tests/unit/rehype-mermaid.test.ts` 的 fixture 是 `'<svg/>'`,**不含尺寸** | `tests/unit/rehype-mermaid.test.ts:19` |

## 決策

| 決策 | 選擇 | 勝出理由 |
| --- | --- | --- |
| 拆分 | mermaid 一份 PR;layouts 刪除另立 spec | 不同子系統、不同驗證方式 |
| A-3 做法 | gantt 原始碼加 `todayMarker off` | 零管線程式碼;hash 自然失效;修改位於語意來源 |
| 尺寸來源 | 讀已 commit 的 SVG 根標籤 | 產物已宣告;**不新增 manifest**(`openwiki/INSTRUCTIONS.md` 明文禁止) |
| 取整 | `Math.round`,**不**輸出精確 `aspect-ratio` | 最大載入前後差 0.889px;distance fraction ≈ 0.001,不值得為此新增第二套比例來源 |
| 錯誤語意 | **fail-loud 雙防線**(producer + consumer) | `runCheck` 會報缺檔,但**完全不報**「檔案存在卻沒尺寸」——兩者不同語意,後者無任何防線 |
| `normalizeSvg` 正規式 | **不加固** | 擴張接受集合換不到「結構性消失」:補了逗號/空白/指數仍會漏單引號、前置 `+`、`.5`、屬性順序。除非改用真正的 XML parser,否則只是搬移邊界 |
| 測試前提 | 必須 `serviceWorkers: 'block'` | 否則量到的是 SW 快取行為,且 SW claim 與首次影像請求是**競態** |

## 架構

### §1 Producer 端不變量(`scripts/mermaid-render.mjs`)

`renderVariant` 已有一道 `DOMParser` 關卡(擋非法 XML)。在它之後**再加一道尺寸檢查**:
用 `parseSvgRootDimensions` 讀 root 的 `width`/`height`,讀不到就讓 render 失敗並指出
hash、variant。

> **實作修正(審查後)**:原本寫的是「從 `DOMParser` 解析結果讀尺寸」。改成用與 consumer
> **完全相同**的字串 parser —— 兩邊各一套 parser 的接受集合不同,會留下「producer 用
> DOMParser 過關、consumer 的字串解析仍失敗」的縫隙,那樣 producer 的保證只是第二意見。
> `DOMParser` 因此維持原職責(只驗 XML 合法性)。

不變量:**任何寫進 `public/mermaid/` 的 SVG 都有合法正尺寸。**

這是主要防線——在生產端保證不變量,比在消費端偵測便宜也更難繞過。未來 mermaid 真的輸出
新格式時會在 `yarn mermaid:render` 明確爆掉,而不是靜默產生沒有尺寸的 markup;屆時再用那份
真實輸出當 fixture,於獨立 PR 修 `normalizeSvg`、bump cache、全量重生。

**不需要 bump `CACHE_VERSION`**:這是新增輸出驗證,不改變 `normalizeSvg` 也不改變任何
SVG bytes。(AGENTS.md 的規則文字含「改 render 邏輯」,但該規則自陳的目的是「任何**影響
渲染輸出**的改動」——純驗證關卡不影響輸出。此判斷刻意記在此處備查。)

### §2 Consumer 端尺寸抽取(`lib/rehype-mermaid.mjs`)

把現有的 `fs.existsSync` 換成一次讀取:

```
existsSync(path) → 布林          ▶  readFileSync → { width, height } | ENOENT | 無效
```

- 讀 `width`/`height` 而非 `viewBox`:兩者等價,但前者是產物**實際宣告的固有尺寸**
- 兩軸各自 `Math.round`,寫進 `imgNode` 的 `width`/`height` properties

> **實作修正(審查後)**:原本寫的是「只讀檔頭 + 簡單 regex」。實際是 `readFileSync`
> 讀整份(20KB × 20 次只發生在建置期,partial read 要處理 fd 與 chunk 邊界,不值得),
> 解析則改用**錨定字串開頭 + 引號感知的循序屬性掃描**。簡單 regex 會被
> `<svg data-note=' width="999"' width="10">` 這種屬性值裡的假字串穿透。

**CSS 不改。** `height: auto` 搭配兩個屬性 → UA 樣式表算出 `aspect-ratio: auto W/H`;沒有
CSS `width` 宣告,所以 used width 仍是屬性寬,與現況(SVG 固有寬)一致,`max-width: none`
+ `.overflow-x-auto` 的水平捲動行為不變。**此點需實測確認,不靠推論。**

### §3 錯誤語意

| 情況 | 行為 | 理由 |
| --- | --- | --- |
| `ENOENT`(檔案不存在) | `return`,保留原節點 → 退化成程式碼區塊 | 維持現有行為;`mermaid-check` **會**回報缺檔,有防線 |
| 檔案存在但不可讀(`EACCES`/`EISDIR`/`ENOTDIR`) | 原樣拋出 | 非預期狀態,不是快取未命中 |
| 根標籤讀不到可用尺寸 | throw,附路徑 | **`mermaid-check` 不會回報這種情況**,靜默 fallback 等於新增一條全綠卻退化的路徑 |

「可用尺寸」的完整定義(**取整後**都要成立,因為那才是真正寫進 HTML 屬性的值):
缺 `width`/`height`、非 SVG 十進位寫法(`0x10`、`10.`)、根元素不是 `<svg>`、
opening tag 有解析不了的殘餘、屬性重複、取整後 `<= 0`(`0.4`)、
取整後不是 safe integer(`1e21`)—— 任一成立即視為不可用。

這正是本 repo 為裸 `<br>` 付過學費的形狀:請求 200、無 console 錯誤、`mermaid-check` 綠燈,
缺陷一路上 production。

### §4 A-3 實作

在 gantt 區塊加一行 `todayMarker off` → 定義改變 → hash 改變 → `writeAll` 把舊的兩個檔案
當孤兒清掉。**預期**淨效果 2 增 2 刪。

> **不可寫成保證**:非 `--check` 模式會重新 render 並重寫**全部** 20 個 SVG,不是只處理變更的
> hash;而 `renderVariant` 自己的註解承認文字量測會因平台、字型而異。「其餘 18 個零變動」
> 只能是本機執行後**確認**的期望,不是設計保證。

## 測試計畫

> 每條斷言都必須做突變測試:**刻意把它宣稱要防的東西弄壞,確認它真的變紅**。抓不到就是空包彈。

### §5 Playwright:版位保留契約

新測試必須自建 context:

```ts
const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
```

流程:

1. navigation **之前**掛好 `context.route('**/mermaid/*.svg', …)`,handler 攔到後先通知、
   再 await 一個外部控制的閘門才 `route.continue()`
2. `goto(fixture, { waitUntil: 'domcontentloaded' })`
3. **斷言 `loading` 仍是 `'lazy'`**(保留 production 行為)
4. 在 figure 內 prepend 一個 **1×1 的捲動 sentinel**,捲它進 viewport 觸發真實 lazy 路徑
5. 等 route 攔到請求(`requestSeen`)
6. 閘門仍關著,量 **pre-load** 幾何
7. 放行,等 `decode()`,量 **post-load** 幾何

**為什麼捲 sentinel 而不是捲圖片**:捲動目標不能依賴圖片自己有沒有非零盒子,否則「移除
height 屬性」的突變會讓觸發本身失效,測試變成因為別的原因紅。

**變體選取不可用 `:visible`**:Playwright 的可見性要求 `width > 0 && height > 0`,零高度
元素不符合,會把「版位退化成零」偽裝成「找不到元素」。改為讀 `getComputedStyle(…).display`
選出顯示中的變體。

#### 斷言分三組,各守不同鏈結

```ts
// 正控制:證明閘門真的攔到了,pre-load 量到的確實是載入前
expect(before.naturalWidth).toBe(0)
expect(before.naturalHeight).toBe(0)

// A. 幾何組 —— 版位有沒有被正確保留
expect(before.widthAttribute).not.toBeNull()
expect(before.heightAttribute).not.toBeNull()
expect(before.rect.height).toBeGreaterThan(0)
expect(before.rect.height).toBeCloseTo(
  before.rect.width * (Number(before.heightAttribute) / Number(before.widthAttribute)), 1)
// 容差 2px 而非 1px:整數 HTML 屬性對上小數固有尺寸,載入後改用真實比例必然有次像素
// 更新。實測被量測那張是 0.7068px,20 個產物的最壞值是 0.8887px —— 1px 只剩 0.11px
// 餘裕。等比縮放的突變因此改由 B 組結構性地接手,不靠容差邊緣去抓。
expect(Math.abs(after.rect.height - before.rect.height)).toBeLessThan(2)
expect(Math.abs(after.sentinelTop - before.sentinelTop)).toBeLessThan(2)

// B. natural-size 錨定 —— 保留的版位是不是對的絕對尺寸
expect(Math.abs(after.naturalWidth - Number(before.widthAttribute))).toBeLessThanOrEqual(1)
expect(Math.abs(after.naturalHeight - Number(before.heightAttribute))).toBeLessThanOrEqual(1)

// C. viewBox 錨定 —— 產物自己的尺寸契約有沒有被守住
expect(resource.rootWidth).toBeCloseTo(resource.viewBoxWidth, 6)
expect(resource.rootHeight).toBeCloseTo(resource.viewBoxHeight, 6)
expect(Number(before.widthAttribute)).toBe(Math.round(resource.viewBoxWidth))
expect(Number(before.heightAttribute)).toBe(Math.round(resource.viewBoxHeight))
```

`sentinelTop` 用**另一個**插在 figure **之後**的 sentinel 量下游位移(與第 4 步的捲動
sentinel 是兩個不同的東西)。`resource` 由測試在放行後 `fetch(img.currentSrc)` 再以
`DOMParser` 解析取得。

C 組**不是**把 viewBox 當 SVG 的普遍規則(root viewport 與 viewBox 本來就允許不同尺度);
它守的是 `normalizeSvg` 明確選定的契約:**root pixel 尺寸 = viewBox extent,HTML 屬性是其
整數化結果**。納入的理由是新的 consumer 程式碼開始**依賴**這個契約。

#### 突變矩陣(三組缺一不可)

| 突變 | 被哪一組抓到 | 為什麼其他組抓不到 |
| --- | --- | --- |
| 移除 `height` 屬性 | A(屬性非 null + pre-load 幾何) | 載入後最終幾何相同,只看 after 會全綠 |
| `height` 寫死 `1` | A(`after` 與 `before` 差 195px) | 屬性比例自洽,**pre-load 幾何組會綠** |
| width/height **同時 ×2** | B(natural size 與屬性不符) | 比例自洽且前後一致,**A 組全綠**;圖被上採樣成兩倍 |
| `normalizeSvg` 把 root 寫成 `2W × 2H` | C(root 與 viewBox 不符) | natural size 也變 2W,**B 組全綠** |
| 讀 light 尺寸套給 dark | 單元(§6 fixture 兩軸不同) | 現有 10 組 light/dark 尺寸剛好相同,Playwright 層測不出 |
| CSS 覆蓋 `height: 1px` | A(pre-load 幾何) | — |
| route 沒攔到 / SW 汙染 | 正控制(`naturalWidth === 0`) | 沒有正控制時,before 其實是 after,整組**無聲空轉通過** |

### §6 單元測試(`tests/unit/rehype-mermaid.test.ts`)

**先做 fixture 遷移**:現有 fixture 是 `'<svg/>'`,不含尺寸;改成 fail-loud 後既有的
「快取命中」測試會壞。要把 fixture 換成帶小數尺寸的真實形狀根標籤,**且 light 與 dark 兩軸
數值刻意不同**(防「讀 light 套給 dark」的實作)。

| 斷言 | 突變 |
| --- | --- |
| 產出 img 的 width/height 是**整數**,且等於各自 fixture 的 round 值 | 拿掉 `Math.round` → 紅 |
| light 與 dark 各自拿到**自己的**尺寸 | 讀 light 套給 dark → 紅 |
| 根標籤讀不到可用尺寸(定義見 §3)→ **throw** 且訊息含路徑 | 改回靜默 fallback → 紅 |
| `ENOENT` 以外的讀檔錯誤(`EISDIR`)→ **原樣拋出** | catch 改成一律 `return null` → 紅 |
| `ENOENT` → 保留原 `pre` 節點,**不 throw** | 改成 throw → 紅(既有測試,行為不得變) |

### §7 A-3 回歸測試

`todayMarker off` 只修目前這一張 gantt。若只靠手動驗證,日後刪掉 directive 重新 render,
所有檢查仍會全綠。需要持久斷言,**放在單元測試層**(不需瀏覽器,CI 每次都跑):

- 掃**全 `data/blog`** 的每一張 gantt,斷言定義**含** `todayMarker off`
- 讀各自 hash 的兩份 committed SVG,**用 hast parser 解析**後斷言沒有任何元素帶
  `today` class token(不是字串比對 —— 見下方修正)
- 一條正控制:掃得到至少一張 gantt(否則掃描壞掉時上面兩條會空轉通過)

> **實作修正(審查後)**:原本寫的是「讀單一 fixture 檔 + 比對精確字串 `class="today"`」,
> 之後又試過兩版自製 regex 掃描,**三版全部被合法輸入穿透**:單一 fixture 讓別篇文章的
> gantt 漏網;精確字串被 `class="today marker"` 與 `class='today'` 繞過;逐標籤掃描則被
> 實體編碼(`class="to&#100;ay"`)與 processing instruction 裡的 `<!--` 穿透 —— 後者會讓
> 剝除吃掉真正的 today 元素,是**假綠**。最終改用已在依賴清單裡的
> `hast-util-from-html-isomorphic` 解析,因為「剝除 XML 結構」本身就需要理解 XML 結構。
> 圖種判斷也不能用
> `startsWith('gantt')`(`%%{init: …}%%` 可以出現在關鍵字之前),改用 `/^\s*gantt\b/im`。

第二條同時把「directive 還在但忘了重新 render」這個狀態抓出來——`mermaid-check` 只比對
檔名,對這種情況是綠的。

**突變**:拿掉 directive 但不重新 render → 第一條紅;拿掉 directive 並重新 render →
兩條都紅。

## 明確排除

- **切主題短暫留白的修法**。§5 的測試會順帶量到隱藏變體的載入時機;先取得事實再決定要不要
  另立工作,不預先設計修法。
- **`normalizeSvg` 與 `CACHE_VERSION`** 一律不動。
- **layouts 刪除**(另一份 spec)。

## 已否決

| 做法 | 否決理由 |
| --- | --- |
| 新增 manifest 存尺寸 | `openwiki/INSTRUCTIONS.md` 明文禁止;SVG 根標籤已有尺寸 |
| render 時凍結 `Date` | 保留 marker 卻指向寫死的假日期——把「會說謊」固定下來而非拿掉 |
| `normalizeSvg` 剝除 `<g class="today">` | 脆弱、隱藏語意,且必須 bump cache 全量重生 |
| 輸出精確 inline `aspect-ratio` | 為消除 < 1px 殘差新增第二套比例來源,並製造新的同步漂移風險 |
| 加固 viewBox 正規式 | 只是擴張 regex 接受集合,問題沒有結構性消失;代價卻是全量重生 |
| Playwright `img:visible` 選變體 | 零高度不符合可見性,把真正的失敗偽裝成「找不到元素」 |
| 強制 `loading = 'eager'` 取得正控制 | 不必要——1×1 sentinel 可同時保住 lazy 保真度與正控制 |
| 只斷言載入後的最終幾何 | 移除 `height` 屬性仍會全綠 |

## 文件連動

- `openwiki/operations/runbook.md`:「mermaid 退化成程式碼區塊」四點排查補第 5 點(ENOENT
  以外的尺寸問題現在是 **build 失敗**,不再退化,排查方向不同)
- `openwiki/INSTRUCTIONS.md` backlog:「Mermaid image dimensions」改寫為已修;
  「Gantt `today` marker」移除
- `AGENTS.md`:新增「HTML `width`/`height` 屬性是非負整數,mermaid viewBox 幾乎都是小數」
  與「量 mermaid 載入行為的測試必須 `serviceWorkers: 'block'`」
- 兩份手冊:確認 mermaid 章節是否描述到 img 輸出;有就同步
- 提交後跑 `openwiki code --update --print`
