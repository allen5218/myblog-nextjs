# Giscus 延後載入與 Playwright 格式修正 Checkpoint

日期：2026-07-17

## 目前 Git 狀態

- PR #39 `perf: reduce initial blog payload` 已 squash merge。
- 本地分支：`main`
- 本地 `main`、`origin/main`、`origin/HEAD`：皆位於 `fad9629`
- `git rev-list --left-right --count main...origin/main`：`0 0`
- 工作樹既有變動：只有 `next-env.d.ts` 的 build/dev typed-routes churn；依
  `AGENTS.md` 不調查、不還原、不提交。
- 本 checkpoint 是本輪唯一刻意新增的檔案，尚未 commit。

## 已確認的產品決策

下一個效能工作只做兩個窄目標：

1. 文章頁延後載入 Giscus。
2. 修正目前三個 Playwright ESLint／Prettier 格式問題。

明確不做：

- 不調整 KBar／`SearchProvider`。過去 KBar、HeadlessUI、手機觸控與漢堡選單曾有
  「第一次 tap 被殘留選單吃掉」的高耦合問題；目前沒有足夠收益支持再改其載入架構。
- 不延伸到 GA、Hero `<Image>`、CSS 拆分或其他推測性優化。
- 不修改 Chiron 分桶或 Serwist policy。

## Giscus 現況

檔案：`components/Comments.tsx`

目前行為：

- client component 掛載後立即 render `@giscus/react`。
- `loading="eager"`，所以文章開啟後立即載入 Giscus iframe、JavaScript 與 GitHub 資源。
- `useTheme().resolvedTheme` 決定初始 theme，theme prop 變更時 Giscus 會同步切換。
- 留言區位於文章底部，即使使用者不捲到留言區也會支付第三方請求成本。

## 下一步 Giscus 成功標準

目標行為：

- 不恢復「Load Comments」按鈕。
- 留言區距離 viewport 約 800～1200px 時自動掛載 Giscus。
- 尚未接近留言區時，不得請求 Giscus iframe／client 資源。
- 接近或捲入 threshold 後只掛載一次，不因離開 viewport 而卸載。
- 保留目前深淺主題的初始正確性與即時同步。
- IntersectionObserver 不可用時要有合理 fallback，避免留言永久消失。
- 不改 layout、Giscus mapping、repo/category、語言或 reactions 設定。

建議的最小實作形狀：

- `Comments` 先 render 一個穩定的 sentinel/container。
- `IntersectionObserver` 使用正向 `rootMargin`，例如
  `1000px 0px 1000px 0px`，只在首次 intersect 後設定 `shouldLoad=true` 並 disconnect。
- `mounted && shouldLoad` 時才 render `<Giscus>`。
- 保留 `resolvedTheme` 的既有計算方式。

測試要求：

1. 先新增會失敗的 production Playwright regression。
2. 在文章頁首屏確認沒有 Giscus iframe／相關網路請求。
3. 捲動到留言區 threshold 後確認 iframe 出現且只載入一次。
4. 驗證初始 theme 與切換 theme 後仍同步。
5. 使用 production build，不用 dev server判斷。

文件要求：

- 行為改變時同步檢查並更新：
  - `docs/functionality-settings-manual.zh-TW.md`
  - `docs/functionality-settings-manual.md`
  - `README.md`（只有既有敘述因此不正確時才改）
- 若實驗得到新的 IntersectionObserver／Giscus 陷阱，再補 `AGENTS.md`。

## Playwright ESLint／Prettier 問題

唯讀重現命令：

```bash
yarn eslint tests/playwright/serwist-precache.spec.ts tests/playwright/social-card.spec.ts
```

目前共三個純格式錯誤，沒有行為或型別錯誤：

1. `tests/playwright/serwist-precache.spec.ts:20`
   - 單一 fixture `browser` 被拆成多行。
   - Prettier 要求改成單行 `async ({ browser }) =>`。
2. `tests/playwright/serwist-precache.spec.ts:67`
   - `page.evaluate` 的單行 callback 被不必要地拆行。
   - Prettier 要求 callback 保持單行。
3. `tests/playwright/social-card.spec.ts:76`
   - `{ page, request }` 超過行寬情境下仍放在單行。
   - Prettier 要求將兩個 fixtures 拆成多行。

這三項不在 required CI 的 lint 範圍；目前 `.github/workflows/ci.yml` 只執行：

```bash
yarn eslint app components lib layouts scripts
```

因此 PR #39 的 required checks 全數通過。下一輪可以在不改測試邏輯的前提下，使用
Prettier 或手動做這三個機械式格式修正，再執行：

```bash
yarn eslint tests/playwright/serwist-precache.spec.ts tests/playwright/social-card.spec.ts
```

## 下一個 session 的建議起手式

1. 讀本 checkpoint、`AGENTS.md` 與雙語手冊的 Comments／Giscus 相關章節。
2. `git fetch origin main`，確認 `main...origin/main` 仍為 `0 0`。
3. 保留 `next-env.d.ts`，從最新 `main` 開新的 `codex/` 功能分支。
4. 先只做三個 Playwright 格式修正並確認 lint clean。
5. 為 Giscus lazy loading 寫 production Playwright RED test。
6. 做最小 IntersectionObserver 實作，保留 theme sync。
7. 跑精確測試、required CI 等價檢查、production build 與 production Playwright。
8. 檢查雙語文件、README、AGENTS，再走標準 PR／required checks／手動 gh merge。

## 2026-07-17 執行計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** 延後文章頁 Giscus 載入、修正三個既存 Playwright 格式問題，並以獨立實驗讓
首頁 LCP 背景圖能在瀏覽器解析 Hero inline style 前被提早發現。

**Architecture:** Giscus 保留既有設定與主題同步，只在穩定容器進入 viewport 前後
1000px 範圍時掛載一次。首頁 page render 一個極小的 Client Component，在 SSR render
期間呼叫 `ReactDOM.preload('/img/home-bg.webp', { as: 'image', type: 'image/webp' })`；
Next.js 16 會把 resource hint 輸出到初始文件，不改 `HuxHero`、圖片格式或其他路由。兩個
效能改動分別由 production Playwright 契約保護。

**Tech Stack:** Next.js 16 App Router、React 19、`@giscus/react`、IntersectionObserver、
Playwright。

### Global Constraints

- 不修改 KBar／`SearchProvider`、GA、Chiron、Serwist policy 或 CSS 拆分。
- 不恢復「Load Comments」按鈕。
- Giscus threshold 固定為 `1000px 0px 1000px 0px`，首次符合後只掛載一次。
- IntersectionObserver 不存在時自動載入，避免留言永久消失。
- 保留 Giscus pathname mapping、repo/category、語言、reactions 與深淺主題同步。
- preload 僅出現在首頁，不得套用到文章、archive、tags 或其他路由。
- 不修改、還原或提交 `next-env.d.ts`。

### Task 1: Playwright 格式清理

**Files:**

- Modify: `tests/playwright/serwist-precache.spec.ts`
- Modify: `tests/playwright/social-card.spec.ts`

1. 使用 Prettier 做 checkpoint 列出的三個純格式修正，不改測試邏輯。
2. 執行
   `yarn eslint tests/playwright/serwist-precache.spec.ts tests/playwright/social-card.spec.ts`，
   預期 0 error。

### Task 2: Giscus 接近 viewport 才載入

**Files:**

- Create: `tests/playwright/comments-lazy-loading.spec.ts`
- Modify: `components/Comments.tsx`
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify: `docs/functionality-settings-manual.md`

1. 先新增 production Playwright 測試：初始文章頁沒有 Giscus iframe 或
   `giscus.app` request；捲到留言容器接近 viewport 後 iframe 出現且只掛載一次；初始
   theme 與切換後 theme 仍同步。
2. 執行測試並確認因目前 eager loading 正確失敗。
3. 在 `Comments` render 穩定的 `#comments-container` sentinel；mounted 後建立
   IntersectionObserver，使用 `rootMargin: '1000px 0px 1000px 0px'`。
4. 首次 intersect 設定 load flag 並 disconnect；API 不存在時直接設定 load flag。
5. 只有 mounted 且 load flag 成立時才 render Giscus；維持現有設定與 theme 計算。
6. 重跑相同 production Playwright 測試並確認通過。
7. 更新雙語手冊，將既有「按 Load Comments 才載入」修正為接近 viewport 自動載入。

### Task 3: 首頁 Hero 背景圖 preload 實驗

**Files:**

- Create: `components/HomeHeroPreload.tsx`
- Modify: `app/page.tsx`
- Create: `tests/playwright/home-hero-preload.spec.ts`
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify: `docs/functionality-settings-manual.md`

1. 先新增 production Playwright 測試，要求首頁 head 有唯一、正確的 WebP image preload，
   並確認文章頁沒有該 preload。
2. 執行測試並確認因 preload 尚不存在正確失敗。
3. 新增 `'use client'` 的 `HomeHeroPreload`，在 render 期間只呼叫
   `ReactDOM.preload('/img/home-bg.webp', { as: 'image', type: 'image/webp' })` 並回傳
   `null`；只由 `app/page.tsx` render。
4. 重跑相同 production Playwright 測試並確認通過。
5. 在雙語手冊記錄首頁預載預設 Hero 背景圖；README 與 AGENTS 僅在既有描述失真或出現
   新陷阱時修改。

### Task 4: 整合驗證與交付

1. 執行精確 Playwright、Playwright ESLint、required CI 等價 lint、Contentlayer +
   `tsc --noEmit`、129 個單元測試、site/OG font checks。
2. 執行 production build；若沙箱超過正常 120 秒且無 lock/error，依 AGENTS 申請提升
   權限重跑。
3. 以 production server 驗證 Giscus 與首頁 preload 契約。
4. 檢查 `git diff --check`、Prettier、雙語文件同步與明確 staging 清單。
5. Commit、push、建立 PR，等待 `ci`、`check` 綠燈後以 `gh` 手動 squash merge。
