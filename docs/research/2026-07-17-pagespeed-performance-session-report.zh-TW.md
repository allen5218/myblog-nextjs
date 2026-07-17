# PageSpeed 效能改善 Session 總結

日期：2026-07-16～2026-07-17

工作分支：`codex/test-home-prefetch`

分析目標：`https://blog.allenspace.de/` 的 PageSpeed Insights desktop 報告

## 1. 起點與問題拆解

初始 PageSpeed desktop 分數約 70，實驗室指標為 FCP 2.5 秒、LCP 2.8 秒、TBT 10 毫秒、
CLS 0.001、Speed Index 2.5 秒。主執行緒阻塞並不嚴重，真正的成本集中在首訪下載量：

- Chiron Sung HK 由 Google Fonts／`next/font` 拆成 23 個 CJK shards。
- 首頁的文章卡片觸發 12 個文章 RSC prefetch。
- Serwist 安裝時沿用預設 glob，預快取全站圖片、JS、CSS 與字型。
- 初始 Service Worker precache 共 122 entries，約 5.4 MiB。
- 全頁初始 payload 約 5.4 MB，與低 TBT、高下載成本的症狀一致。

使用者要求保留 Chiron Sung HK，且 `img.allenspace.de` 的 Cloudflare CDN TTL 視為固定、
不納入修改，因此工作聚焦在「只載入當前頁真正需要的字型與資源」。

## 2. 首頁 RSC prefetch 實驗

在 `components/hux/HuxPostCard.tsx` 的文章連結加入 `prefetch={false}`，避免首頁載入後
自動抓取所有文章內頁 RSC payload。新增 Playwright regression，直接監聽帶 `_rsc`
query 的文章請求；production 驗證結果為 0 個文章 RSC prefetch。正常點擊、分頁與既有
redirect 行為保持不變。

## 3. Serwist precache 實驗

在 `app/serwist/[path]/route.ts` 明確設定 `globPatterns: []`，只保留 `/offline/` 為
precache entry。頁面、圖片、JS、CSS 與字型仍由 `defaultCache` 在實際使用時按需快取。

修改前後的觀察：

- 修改前：122 precache entries，約 5.4 MiB。
- 修改後：1 precache entry，build 顯示 0.00 KiB（revision URL 為 `/offline/`）。
- 未瀏覽頁面在離線狀態仍正確顯示離線後備頁。
- Service Worker 測試先確認能捕捉已知的 `/offline/` install fetch，再斷言沒有 eager
  fetch Chiron WOFF2，避免「監聽失效但零請求仍通過」的 vacuous test。

## 4. Chiron Sung HK 字型架構

### 4.1 字型來源與 corpus

保留 Chiron Sung HK variable font 的 200–900 字重。來源 TTF 鎖定 Google Fonts repository
revision 與 SHA-256，不在 Vercel 動態下載。建立 corpus collector，涵蓋固定 UI、metadata、
dictionaries、首頁與 15 篇文章，並處理 NFC、emoji、variation selector、keycap、control、
private/unassigned code points 等邊界。

### 4.2 Schema v2 分桶

最初的 code point `% 8` 分桶會讓幾乎每一頁載入所有字型，實測約 751 KB，因而改成
committed co-occurrence assignments：

- 一個 committed、只增不減的 core。
- 五個依頁面字符共現最佳化的 supplemental buckets。
- `font-data/chiron/supplemental-assignments.json` 是 authoritative assignment history。
- 普通更新只安置新字符，不重排既有字符；CI 以 `origin/main` map 防止換桶或刪除。

為讓所有頁面的固定 footer 留在 core，最後只額外提升 `箱`、`絡`、`聯` 三個字符。

### 4.3 產物與預算

產生六個 content-addressed WOFF2，總計 729,528 bytes：

| 產物           |   Bytes |
| -------------- | ------: |
| Core           | 295,888 |
| Supplemental 0 |  72,136 |
| Supplemental 1 |  65,404 |
| Supplemental 2 |  57,652 |
| Supplemental 3 |  63,444 |
| Supplemental 4 | 175,004 |

production 實測：

- 首頁：1 request，只載入 core，295,888 bytes。
- 代表文章：3 requests，528,544 bytes。
- 最差 cryosleep 文章：3 requests，543,028 bytes。
- 所有目前頁面均符合首頁不超過 350,000 bytes／1 request、文章不超過
  550,000 bytes／3 requests 的預算。

### 4.4 Runtime 切換與快取

`app/layout.tsx` 移除 `next/font/google` 的 Chiron initializer，改載入 committed
`css/chiron-font.generated.css`。保留既有 CSS variable、fallback stack、CSP、theme 與
scroll classes。`next.config.mjs` 只對 `/static/fonts/chiron/*.woff2` 設定一年 immutable
cache；沒有修改圖片 CDN 或其他 header。

## 5. 產生器、checker 與安全性

新增 `update:site-font`／`check:site-font` 工具、單元測試及交易式產物更新：

- HarfBuzz 先產生 staged TTF，再用 `woff2_compress` 壓縮。
- 驗證 WOFF2 magic、可解壓、exact cmap closure、`.notdef` 與 `wght` axis。
- 更新失敗時回滾 fonts、CSS、core 與 assignments，不留下半套產物。
- `yarn update:site-font` 先 fresh build Contentlayer，再完整轉交 CLI args，避免乾淨 checkout
  失敗或讀到過期 `.contentlayer`。
- Generator 與 checker 共用 canonical CSS renderer；checker 對整份 CSS byte-for-byte
  比對，涵蓋 family、style、200–900 weight、display、URL、face order、`:root` variable
  與 exact `unicode-range`。
- Mutation tests 證明上述任一欄位或 face order 被破壞時都會失敗。

## 6. CI、文件與操作規則

required GitHub Action `check` 現在會：

1. 安裝 `libharfbuzz-bin` 與 `woff2`。
2. 產生 Contentlayer models。
3. 從 `origin/main` 取出 assignment history（初次 rollout 缺檔時允許）。
4. 執行 `yarn check:site-font --full`。

Vercel 缺少 HarfBuzz／woff2 時只跳過工具相依的動態檢查，schema、hash、CSS、corpus 與
頁面預算等靜態檢查仍會執行。中英文 functionality manuals、`AGENTS.md`、設計規格與
implementation plan 已同步架構、指令、回滾、預算及維護方式。

## 7. 除錯與 review 過程

工作採子代理分工與獨立 reviewer。review 過程實際找出並修正：

- Service Worker test 可能零觀測誤過。
- JSDoc API contract 造成 `tsc --noEmit` 失敗。
- Checker 只數 CSS URL、未驗證 CSS 語意。
- `update:site-font` 可能讀取缺失或過期 Contentlayer model。
- Assignment map、transaction rollback、Contentlayer page model、字型 cmap 與 bucket budget
  的多個邊界條件。

最終全分支 reviewer 結論為 APPROVE，無 correctness、security、regression 或 CI blocker。

## 8. 最終驗證

- `yarn check:og-font`：通過。
- `yarn contentlayer2 build`：17 documents。
- `yarn check:site-font --full`：通過，729,528 bytes。
- ESLint：通過。
- `yarn tsc --noEmit`：通過。
- Vitest：15 files、120 tests 全通過。
- Next.js 16.2.10 production build：81 static pages，通過。
- Serwist build：1 precache entry。
- Production Playwright：14/14 通過。
- 本地 `main...origin/main`：`0 0`。
- `next-env.d.ts` 是 dev/build 交替產生的環境 churn，依 repo 規則未納入任何 commit。

## 9. Codex 沙箱鑑別結果

最後一次完整驗證時，沙箱內的 `yarn build` 在
`Creating an optimized production build ...` 停留超過數分鐘，沒有新輸出。終止後以
提升權限在沙箱外重跑同一份程式碼，Turbopack 約 4 秒完成 compile，整個 build 約 15 秒
完成。這次差異支持「Codex 沙箱限制導致假性卡住」，而不是 Next 16 production build
本身退化。此排查規則已寫入 `AGENTS.md`。

## 10. 尚未執行

本 session 已完成本地實作、commit、review 與驗證，但尚未 push、建立 PR 或合併到
`main`。正式部署後仍應以新的 PageSpeed run 比較 production 實際分數；本地驗證能確認
請求與 bytes 預算，但不能替代 Vercel／真實網路環境的 PSI 數據。
