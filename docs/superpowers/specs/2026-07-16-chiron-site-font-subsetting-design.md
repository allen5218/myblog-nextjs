# Chiron Sung HK 網站字型子集化設計

**日期：** 2026-07-16  
**狀態：** 已核准設計，尚未實作

## 目標

全站繼續使用 Chiron Sung HK 可變字型（`font-weight: 200 900`），但以本站字集重新分片，避免 `next/font/google` 產生的 118 個通用 CJK 分片讓單頁命中二十多個大型檔案。

既有實驗結果是本設計的基準：

- 首頁命中 23 個 Google TTF 分片，Brotli 後約 2.44 MB；本站首頁 variable subset 約 297 KB。
- 近期文章命中 27 個分片，Brotli 後約 2.78 MB；該文章完整 variable subset 約 347 KB。
- 首頁核心加該文章額外字元約 452 KB。
- 固定 400 與 700 兩檔合計大於單一 variable subset，因此不拆固定字重。

成功條件：

1. 全站 computed font 仍是 Chiron Sung HK，並保留 `wght` 200–900。
2. 首頁載入一個核心 WOFF2；只有實際出現低頻字時才下載補充分片。
3. 任一應由 Chiron 承載的站內可見字元缺字時，GitHub required check 必須失敗，不得靠系統 fallback 靜默通過；emoji 與 control characters 明確不屬於 Chiron coverage。
4. 新增文章不會重排既有字元，也不會讓所有字型檔同時 cache bust。
5. Vercel build 不需要 HarfBuzz 或網路下載字型。

## 非目標

- 不改用其他字型、不限縮 Chiron Sung HK 的頁面或元件範圍。
- 不拆成 400／700 靜態字重。
- 不把每篇文章做成專用字型檔。
- 不修改 `img.allenspace.de`。其 Cloudflare CDN 四小時 TTL 視為固定且不在本案範圍；網站字型由本站同源提供，設計不依賴該 CDN 或其 cache rule。
- 不合併或重寫現有 OG/social-card 的 400／700 TTF 子集流程。

## 架構

以一個穩定核心和八個可重用 supplemental bucket 取代 `next/font/google`：

- `core.woff2` 包含固定 UI 字集、ASCII，以及經明確操作納入的全站高頻字。
- 低頻字依 Unicode code point 的固定函式分配至八個 bucket；瀏覽器透過 `unicode-range` 只下載頁面命中的檔案。
- 所有檔案都是從同一份 Chiron Sung HK variable source 產生，保留完整 `wght` 200–900 axis、OpenType layout features 和必要 name table。
- 生成的 WOFF2、CSS 與 manifest 全部 commit。Runtime 和 Vercel build 只讀靜態產物。
- 自行生成 `@font-face`，不用 `next/font/local`。`next/font/local` 無法適當表達這組精細的多檔 `unicode-range` 規則；現有 `--font-chiron-sung-hk` CSS variable 則繼續作為使用端介面。

### 核心穩定政策

核心字集由以下兩部分組成：

1. **固定 seed：** ASCII、網站 metadata、`dictionaries/zh-TW.json`、`dictionaries/en.json`，以及 Header、Footer、搜尋、分頁、離線頁等共用 UI 的靜態文字。
2. **高頻集合：** 在 `data/blog/**` 中出現在至少五份不同 Markdown/MDX 文件的字符。頻率以「文件數」計算，同一篇文章重複出現只算一次，避免單篇長文主宰核心。

一般 `yarn update:site-font` **不得重算核心**；它使用 committed `core-codepoints.txt`，只更新目前 corpus 所需的 supplemental buckets。只有人類明確執行 `yarn update:site-font --rebuild-core` 才能重算高頻候選。

`--rebuild-core` 採單調擴充：新核心 = 既有核心 ∪ 固定 seed ∪ 目前高頻集合。字符不會因文章刪除或頻率下降而自動移出核心。若未來需要縮減核心，必須另開效能變更，明確編輯核心、量測首頁與代表文章、並接受核心檔 cache bust；本工具不提供自動 prune。

這項政策讓新增文章通常只改一至數個 supplemental 檔；核心只在刻意進行的效能維護中改變。

### Supplemental bucket 穩定政策

- 核心之外、且 Chiron source 支援的每個 code point 固定分配為 `codePoint % 8`，bucket 編號為 `0` 至 `7`。
- bucket 數量和映射函式寫入 manifest schema，正常更新不得改動。
- 新增字符只會加入其固定 bucket，不會讓既有字符移至其他檔案。
- 每個 bucket 只包含目前完整 corpus 實際使用的字符，不把整段 Unicode block 塞入產物。
- CSS 的 `unicode-range` 由該產物實際 code point 生成；連續 code point 合併成 range，其餘用單點 `U+XXXX`。
- 空 bucket 不輸出 `@font-face` 或 WOFF2；manifest 仍記錄它是空集合。
- 若日後實測八個 bucket 的請求開銷不理想，調整 bucket 數或函式屬架構版本變更，需新 manifest schema、production 網路量測和明確 cache-bust rollout，不可由更新腳本自動調整。

## 檔案邊界

### 新增

- `scripts/site-font-source.mjs`
  - 唯一字型來源 URL、上游 revision、預期 SHA-256、下載快取與完整性驗證。
- `scripts/site-font-text.mjs`
  - 蒐集固定 seed、文章全文及其他站內可見文字；正規化字符並排除 emoji/control characters。
- `scripts/site-font-plan.mjs`
  - 高頻統計、核心單調擴充、`codePoint % 8` 分配、range 壓縮及 manifest model。
- `scripts/update-site-font.mjs`
  - 明確更新命令；呼叫 `hb-subset` 產生暫存 variable TTF，再以 `woff2_compress` 產生 WOFF2、內容 hash 檔名、CSS 和 manifest。
- `scripts/check-site-font.mjs`
  - 靜態一致性、source integrity、glyph coverage、variable axis 與產物新鮮度檢查。
- `scripts/site-font-check-policy.mjs`
  - 集中定義 Vercel 缺 HarfBuzz 時可跳過哪些動態檢查；不可跳過 manifest/hash 靜態檢查。
- `font-data/chiron/core-codepoints.txt`
  - 排序後、每行一個大寫十六進位 code point；為核心的 authoritative committed input。
- `font-data/chiron/source.json`
  - source URL、upstream revision、SHA-256、family、axis 範圍與授權資訊。
- `public/static/fonts/chiron/manifest.json`
  - schema version、source hash、core policy、bucket policy、每個產物的字符、bytes 與 SHA-256。
- `public/static/fonts/chiron/*.woff2`
  - 內容 hash 檔名的 committed variable WOFF2。
- `css/chiron-font.generated.css`
  - 由 manifest 生成的 `@font-face`；不得手改。
- `tests/unit/site-font-text.test.ts`
- `tests/unit/site-font-plan.test.ts`
- `tests/unit/site-font-check-policy.test.ts`
- `tests/playwright/site-font-loading.spec.ts`

### 修改

- `app/layout.tsx`
  - 移除 `Chiron_Sung_HK` 與 `next/font/google` 初始化，改由根 layout 匯入 generated CSS。
- `css/tailwind.css`
  - 仍以 `var(--font-chiron-sung-hk)` 作為全站 `--font-sans` 首選，不改視覺範圍。
- `next.config.mjs`
  - 對內容 hash 的 `/static/fonts/chiron/*.woff2` 增加一年 immutable cache header；不改 CSP 的 `font-src 'self'`。
- `package.json`
  - 新增 `check:site-font`、`update:site-font`；`build` 在現有 OG check 旁執行 site-font 靜態檢查。
- `.github/workflows/og-font-check.yml`
  - 在現有 required job `check` 內加上 `yarn check:site-font`，不得改 job/context 名稱。
- `.github/workflows/pages.yml`
  - 維持安裝 `libharfbuzz-bin`；若 workflow 需要重產字型，另安裝 `woff2` 套件提供 `woff2_compress`。
- `app/serwist/[path]/route.ts`
  - 不把字型重新加入 precache；字型維持按瀏覽器需求載入並由既有 runtime cache 處理。
- `docs/functionality-settings-manual.md`
- `docs/functionality-settings-manual.zh-TW.md`
- `README.md`（只有現有功能描述因字型來源改變而不再正確時才修改）。

OG 字型可在後續小型重構中共用 source-download helper，但本案第一版不改 `scripts/update-og-font.mjs`、`scripts/check-og-font.mjs`、`lib/social-card-font.ts` 或 OG TTF 檔案，降低 blast radius。

## Source 與版本完整性

- Source 使用 Google Fonts repository 中明確 revision 的 `ChironSungHK[wght].ttf` raw URL，不追蹤 `main` 的浮動內容。
- `source.json` 必須記錄 revision 與完整檔案 SHA-256。下載後先驗 hash，再交給 HarfBuzz；不符立即失敗且不得覆寫 committed 產物。
- 更新上游字型必須先明確修改 revision 和 SHA-256，再執行完整 regenerate、glyph/axis tests 與 production 視覺檢查。
- 保留並隨網站分發既有 OFL license；source metadata 必須指向同一授權版本。
- 更新腳本使用 OS temp cache，但每次使用前都重新驗 SHA-256，不能以「檔案大小足夠」作信任依據。

## 生成與資料流

1. `site-font-text.mjs` 掃描 UI seed、字典、metadata 和 `data/blog/**/*.{md,mdx,markdown}` 全文。
2. 所有文字以 Unicode NFC 正規化；保留字母、數字、標點、數學符號與空格，排除 control、variation selector 和 emoji。emoji 明確交由現有 color-emoji fallback stack 顯示；排除字符仍由測試列出，避免過濾規則靜默擴張。
3. `site-font-plan.mjs` 讀取 committed core；只有 `--rebuild-core` 才將符合五文件門檻的字符單調加入並寫回 `core-codepoints.txt`。
4. 對 source cmap 驗證 corpus。若站內字符不在 Chiron source，命令列出 code point、字符及來源檔案後失敗；必須由人類決定是否允許 fallback，不能默默忽略。
5. 非核心字符以 `codePoint % 8` 分配。
6. 每個非空集合使用 `hb-subset` 產生暫存 variable TTF，輸入文字必須走 UTF-8 `--text-file`，並指定 `--layout-features=*`、保留必要 name table、glyph names 和完整 `wght` axis（不得傳入會 instantiate axis 的 `--variations`）。再以 `woff2_compress` 將暫存 TTF 轉成 WOFF2；不得將 CJK 文字放入 argv。
7. TTF、WOFF2、manifest 與 CSS 全部先寫入 temp staging directory。全部 subset、compression、shape、axis、hash 驗證成功後，才以一次同步步驟更新 committed output；任一 `hb-subset` 或 `woff2_compress` 失敗都不得留下半套產物。
8. WOFF2 檔名為內容 SHA-256 前 16 個 hex，例如 `core.a1b2c3d4e5f60718.woff2`、`supplement-3.….woff2`。
9. 生成 manifest，再由 manifest 生成 CSS；CSS 中所有 face 使用相同 family、`font-style: normal`、`font-weight: 200 900`、`font-display: swap` 和精確 `unicode-range`。同一份 generated CSS 在 `:root` 定義 `--font-chiron-sung-hk: 'Chiron Sung HK'`，取代原本由 `next/font` class 注入的 variable；`app/layout.tsx` 不再需要字型 class。
10. 清除不再被新 manifest 引用的舊 hashed WOFF2，但只限 `public/static/fonts/chiron/`，不得清理其他字型。

## Cache 與 CSP

- 字型 URL 為同源 `/static/fonts/chiron/<content-hash>.woff2`，現有 CSP `font-src 'self'` 足夠，不新增第三方來源。
- 應由 Next headers 對該 hashed 路徑設定 `Cache-Control: public, max-age=31536000, immutable`；manifest 與 generated CSS 隨 deployment 更新，不使用 immutable。
- HTML/CSS 引用新 hash 後舊檔可由部署自然淘汰；瀏覽器已快取的未變 bucket 可跨 deployment 重用。
- Serwist 必須繼續使用目前 `globPatterns: []` 的限縮 precache，不得把所有字型 bucket 加回 install-time precache。

## Vercel 與 CI

### Vercel

- Vercel 沒有 HarfBuzz／`woff2_compress`，因此不生成字型。
- `yarn build` 的 `check:site-font` 永遠執行 manifest schema、檔案存在、檔案 SHA-256、CSS 引用和 core/bucket 集合一致性檢查。
- `VERCEL=1` 且找不到 `hb-shape`／`hb-subset` 時，可以明確警告後跳過 glyph shaping、axis inspection 和 regenerate freshness 的動態部分；不能跳過上述靜態檢查。

### GitHub Actions

- 沿用 `.github/workflows/og-font-check.yml` 的 required `check` job；Task 7 必須安裝 `libharfbuzz-bin` 與提供 `woff2_compress` 的 Ubuntu `woff2` 套件。
- 在 `yarn check:og-font` 後執行 `yarn check:site-font --full`。
- Full check 必須驗證全部 corpus 無 `.notdef`、每個產物 cmap 與 manifest 相符、`wght` axis 覆蓋 200–900，以及使用 committed core/bucket plan 重產的字符集合沒有過期。
- 不要求 Linux 重產檔案和 macOS committed WOFF2 byte-for-byte 相等；跨平台 HarfBuzz 版本可能造成二進位差異。CI 驗字符集合、實際 glyph、axis 和 committed hash 自洽，而非重新生成 bytes 比對。
- required workflow 不加 `paths:` filter，避免沒有回報 context 導致 PR 永久 pending。

## 失敗處理

- **缺 HarfBuzz／woff2_compress：** 本機 update/full check 立即失敗並提示安裝；只有 Vercel 可依政策跳過動態檢查。macOS 使用 Homebrew `harfbuzz` 與 `woff2`，Ubuntu 使用 `libharfbuzz-bin` 與 `woff2`。
- **source hash 不符：** 立即停止，不寫任何產物；要求明確更新 pinned revision/hash。
- **Chiron source 缺字：** 列出字符、code point 和來源檔案後失敗。若確定需系統 fallback，必須把例外寫入一份明確 allowlist 並附理由與測試；第一版不建立空白 allowlist 機制。
- **committed 產物過期：** check 顯示應執行 `yarn update:site-font`；若是核心高頻候選變化，普通 update 仍不改核心，只有維護者選擇 `--rebuild-core`。
- **生成中斷：** temp outputs 丟棄，repo 內既有完整產物保持不變。
- **CSS／manifest／檔案不一致：** 所有環境 build 失敗，包括 Vercel。
- **效能退步：** 若首頁 core 傳輸量較核准基準 297 KB 增加超過 15%，full check 只輸出明確警告與 bytes 差異，不自動刪核心字符；由維護者決定另開核心 prune 設計。功能完整性仍優先於自動縮檔。

## 測試與驗收

### Unit tests

- 固定 seed 包含 ASCII、雙語字典、metadata 與共用 UI。
- 文件頻率以 distinct document 計算；第五份文件觸發候選，單篇重複不會觸發。
- 普通 update 不改 core；`--rebuild-core` 只新增、不刪除。
- 相同 code point 永遠得到 `codePoint % 8` 的相同 bucket。
- core 與 buckets 互斥，八個 buckets 彼此互斥；目前 supported corpus 必須是 core 與 buckets 聯集的子集，buckets 必須是目前 corpus 的子集。單調核心可以保留已不在目前 corpus 的歷史字元，因此不要求聯集恰好等於目前 corpus。
- Unicode range 會排序、去重、合併連續 code point。
- Vercel 只可跳過動態 HarfBuzz 檢查，靜態 hash/manifest 錯誤仍失敗。

### Full font checks

- 對完整 corpus 執行 `hb-shape --text-file`，所有產物組合不得產生 `.notdef`。
- 使用 HarfBuzz/font inspection 驗證每個 WOFF2 的 `wght` axis 最小 200、最大 900。
- 產物 cmap 必須與 manifest 宣告完全一致；不得包含另一 bucket 的 corpus 字符。
- Source、產物與 manifest SHA-256 全部符合。

### Production Playwright

- 使用 production build，不使用 dev server判斷載入行為。
- 首頁和代表性繁中文章的 computed `font-family` 第一順位為 Chiron Sung HK。
- 400、700 與至少一個中間值（例如 550）在 rendered font 中使用同一 variable family。
- 清空 browser cache 和 service worker 後載入首頁，字型請求只包含 core，或只包含測試 fixture 已明確預期的 supplemental bucket。
- 載入代表文章只請求其 code points 命中的 buckets，不請求其餘 buckets。
- Serwist install 不會預抓所有 WOFF2；離線 fallback 與 runtime caching 既有測試仍通過。

### 視覺與效能驗收

- 比對首頁、文章、搜尋、深色模式、繁中／英文、粗體與標點截圖；不可出現 tofu、明顯 font swap layout shift 或字重退化。
- 在 production 網路記錄首頁字型 transfer。第一版接受標準：不超過 350 KB，且不超過兩個字型請求。
- 代表文章首次直入的總字型 transfer 接受標準：不超過 550 KB。
- 部署後重跑 PageSpeed Insights；記錄 FCP、LCP、總傳輸量與字型請求，作為結果而非以單次 Lighthouse 分數作 merge gate。

## Rollout

1. 先只加入 collector、planner、生成器與 tests，生成 committed WOFF2/CSS/manifest；網站仍使用 `next/font/google`，比較產物字符與 bytes。
2. Full CI 通過後，在同一功能分支切換 `app/layout.tsx` 至 generated CSS，保留 CSS variable 和 fallback stack。
3. 跑 production Playwright、完整 unit/CI、字型網路量測與代表頁視覺檢查。
4. 更新中英文功能手冊；若 README 的 self-host 描述不再正確則同步更新。
5. 走既有 branch → PR → required `ci`/`check` → manual merge 流程，不啟用 auto-merge。
6. Vercel preview 驗證 CSP、cache headers、首頁和文章；合併後在 production 重跑 PageSpeed。

## Rollback

- 回滾單一功能提交即可恢復 `next/font/google` 的 `Chiron_Sung_HK` 初始化與原 `app/layout.tsx` class；不需要改內容或 OG 字型。
- 回滾時移除 generated CSS import，但 hashed WOFF2 即使暫留也不會被請求；可在後續非緊急 cleanup 提交移除。
- 不用清除使用者 browser cache：舊 hashed files 與 `next/font` 新 URL 不衝突。
- 若只是一個 supplemental bucket 缺字，先回滾整個切換，不在 production 手改 generated CSS 或 manifest。

## 與目前分支的邊界

目前 shared branch 已有同一輪效能工作的未提交變更，實作與提交時必須完整保留：

- 首頁文章連結的 `prefetch={false}` 與對應 pagination 測試。
- Serwist `globPatterns: []`、precache 測試與中英文文件修改。

`next-env.d.ts` 是 Next dev/build 交替造成的環境翻動，任何 staging 或 commit 都必須用明確檔案清單排除。不得 reset、checkout 或覆寫 shared worktree 的既有修改。

## 已否決替代方案

### 單一全站 corpus WOFF2

實作最簡單，但每次新增字符都改變整檔 hash，讓所有訪客失去跨部署快取；字型也會隨內容持續膨脹。可作實驗，不能作長期架構。

### 核心＋每篇文章專用 subset

單頁 bytes 可能最低，但產生大量檔案，文章之間無法有效共享 cache，列表／搜尋／多文章導航也難管理。固定 reusable buckets 的維護成本與 cache 行為更可預測。

### 固定 400／700 字重

實驗已顯示兩個靜態 subset 合計大於一個 variable subset，並會失去 200–900 的既有設計能力，因此不採用。

### 只限縮首頁或文章頁字型範圍

會改變全站視覺，而且沒有解決文章頁的 CJK 傳輸問題，違反保留 Chiron Sung HK 全站使用的需求。

## 實作前不可變決策

- 核心 = 固定 UI seed + 至少五份文件使用的高頻字，且只透過 `--rebuild-core` 單調擴充。
- Supplemental 使用八個固定 `codePoint % 8` buckets。
- 網頁產物為 committed variable WOFF2；OG 固定字重 TTF 維持獨立。
- Vercel 不生成字型；GitHub required `check` 補完整 HarfBuzz 驗證。
- 字型同源、自訂 `@font-face`、`unicode-range` 與 hashed immutable URLs；不依賴圖片 CDN。
