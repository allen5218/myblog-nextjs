# 文章 publication policy 單一入口設計(PR1)

## 背景

`draft` 與 `hidden` 的判斷散落在多處,且**六個公開入口各自為政**。這條線原本是
`headerStyle: text`(見 `2026-07-30-header-style-text-design.md`)的附帶發現 —— 當日日期的
hidden 測試 fixture 會撞到 pager 斷言。它與 hero 外觀在因果上無關,故獨立成本 PR,**先做**。

### 語意(手冊 `functionality-settings-manual.zh-TW.md` §草稿 vs. 隱藏)

| 欄位 | 語意 |
| --- | --- |
| `draft: true` | 未發佈。**production 全面排除** |
| `hidden: true` | 已發佈但不列出。可以路徑直達,不進任何列表 |

## 現況(全部經原始碼驗證)

| 位置 | 現況 | 後果 |
| --- | --- | --- |
| `pliny/utils/contentlayer.js` `allCoreContent()` | production 才 `.filter(c => !('draft' in c && c.draft === true))` | 唯一的 draft 閘門,但只在 production 生效 |
| 同檔 module 頂層 | `isProduction` 在 **module load 時**算好並快取 | vitest 是 `NODE_ENV=test`,單元測試裡 draft **不會**被過濾 |
| 同檔 `sortPosts()` | `return allBlogs.sort(...)` | **原地 mutate 輸入陣列** |
| 文章 route `Page()` | 同一份 `allCoreContent(sortPosts(allBlogs))` 同時當 404 閘門與 pager 序列 | 兩個職責綁在一起,任一方的修改會傷到另一方 |
| 文章 route `generateMetadata()` | raw `findPost(params)` | draft 仍產生 metadata |
| 文章 route `generateStaticParams()` | raw `allBlogs.map(...)` | draft 仍產生靜態路徑 |
| OG route `generateStaticParams()` 與 lookup | raw `allBlogs` | **draft 的 `/opengraph-image` 仍回傳含標題的 PNG** |
| legacy `/blog/[...slug]` redirect | raw `allBlogs.find(...)` | **draft 仍 308,洩漏 canonical path** |
| pager prev/next | 完全沒過濾 `hidden` | `data/blog/hidden/` 現有 6 篇全在公開 pager 鏈上 |

**目前沒有任何 `draft: true` fixture**,所以 draft 相關路徑從未被執行過。

`blog-parity.spec.ts` 那條測試的名字就是「listed surfaces use legacy URLs and keep hidden posts
out」—— 意圖早就存在,只是 pager 這個表面被漏掉了。

## 目標

1. 建立**單一入口** `lib/post-publication.ts`,所有公開表面共用。
2. 修掉 hidden 洩漏進公開 pager。
3. 修掉 draft 從 OG endpoint 與 legacy redirect 洩漏。
4. 保留 hidden 的路徑直達(既有測試已在守)。
5. 保留非 production 的 draft 預覽能力。

## 非目標

- 不改 `layout` 解析(見 memory `unused-starter-layouts`)。
- 不動 sitemap / search index / series / 首頁 / archive / tag 的現有過濾邏輯 —— **本 PR 只讓它們
  可以改用新入口,不強制一次全換**。強換會需要一整組 characterization tests,爆炸半徑過大。
- 不涉及 `headerStyle`(PR2)。

## 架構

`lib/post-publication.ts`:

```ts
type PolicyOptions = { production: boolean }

export function isPublished(post: MinimalPost, options: PolicyOptions): boolean
export function isListed(post: MinimalPost, options: PolicyOptions): boolean
export function publishedPosts<T>(posts: T[], options: PolicyOptions): T[]
export function findPublishedPost<T>(posts: T[], path: string, options: PolicyOptions): T | undefined
export function resolvePostNeighbors<T>(
  posts: T[],
  path: string,
  options: PolicyOptions
): { prev?: T; next?: T }
```

三個關鍵設計約束:

1. **`production` 由參數注入,不讀 `process.env`。** pliny 在 module load 就快取 `isProduction`,
   所以單元測試無法用環境變數覆蓋它。注入是唯一能同時覆蓋兩種模式的乾淨辦法。
2. **所有函式不得 mutate 輸入。** `sortPosts()` 會原地 `.sort()`,所以內部排序前必須先複製。
3. **`resolvePostNeighbors()` 必須封裝 `-1` index 陷阱。** 天真實作:

   ```ts
   const index = listed.findIndex(...) // hidden 或不在序列 → -1
   const prev = listed[index + 1]      // listed[0] —— 最新文章,不是 undefined
   ```

   current 不在 listed 序列時必須明確回傳 `{ prev: undefined, next: undefined }`。

### 三個必須分清楚的關注點

| 關注點 | 用什麼 | 錯誤後果 |
| --- | --- | --- |
| draft 的 404 閘門 | `findPublishedPost()` | 用 raw `findPost()` → draft 從 404 變 200 |
| hidden 的 pager 排除 | `resolvePostNeighbors()`(內部 `isListed`) | 不做 → hidden 洩漏進公開導覽 |
| hidden 自己的頁面仍可訪問 | hidden **通過** `isPublished` | 用 listed 清單當閘門 → hidden 404 |

### 各 route 的改法

```ts
// 文章 route
const post = findPublishedPost(allBlogs, routePath(params), { production })
if (!post) return notFound()
const { prev, next } = resolvePostNeighbors(allBlogs, routePath(params), { production })
```

`generateMetadata()`、文章 route 的 `generateStaticParams()`、OG route 的兩處、legacy redirect
全部改用 `findPublishedPost()` / `publishedPosts()`。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `lib/post-publication.ts` | 新增 |
| `app/[year]/[month]/[day]/[slug]/page.tsx` | `Page`、`generateMetadata`、`generateStaticParams` 三處改用新入口 |
| `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx` | `generateStaticParams` 與 lookup 兩處 |
| `app/blog/[...slug]/page.tsx` | legacy redirect 的 lookup |
| `data/blog/hidden/2026-07-30-draft-gate-test.md` | 新增 fixture:`draft: true` + `hidden: true`,內容全 ASCII |
| `tests/unit/post-publication.test.ts` | 新增 |
| `tests/playwright/publication-policy.spec.ts` | 新增 |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都更新 draft/hidden 的行為描述(含 OG 與 legacy alias) |

`next-env.d.ts` 一律排除,commit 用明確的 `git add <檔案清單>`。

## 驗證

### CI 覆蓋範圍的硬限制

必過的 `ci` job 只跑 `contentlayer2 build`、`eslint`、`tsc --noEmit`、`test:unit`。
**Playwright 不是 CI gate**,所以政策的核心契約必須落在 unit 層;E2E 負責證明 route 真的接上了。

### Unit(`tests/unit/post-publication.test.ts`)

- `production: true` → draft 不在 `publishedPosts()`、`findPublishedPost()` 回 undefined
- **`production: false` → draft 仍在**(否則「所有環境永遠排除 draft」也會假綠)
- hidden 在 `isPublished` 內、不在 `isListed` 內
- hidden 的相鄰公開文章 prev/next 互指(跳過 hidden)
- **hidden 自己回 `{ prev: undefined, next: undefined }`**(釘死 `-1` 陷阱)
- **所有函式呼叫後,輸入陣列的順序與內容不變**(釘死 `sortPosts` 的原地排序)

### E2E(`tests/playwright/publication-policy.spec.ts`,production build)

draft fixture 必須同時設 `draft: true` + `hidden: true`:`hidden` 避免它先進入
search/tag/series 產物;而 standalone `contentlayer2 build` 不保證帶 `NODE_ENV=production`,
所以測試必須跑在真正的 production build 上。

- canonical URL → **404**
- `/opengraph-image` → **404**(不是含標題的 PNG)
- legacy `/blog/...` alias → **404**,而**不是 308**
- **404 HTML 不含該 draft 的唯一標題**(防止洩漏)
- hidden(非 draft)路徑 → 仍 **200**
- 最新公開文章 → **只有 previous**,沒有指向 hidden 的 next

### 突變測試(每條都要做)

| 突變 | 應變紅 |
| --- | --- |
| 閘門改回 raw `findPost()` | canonical 404 |
| OG route 改回 raw `allBlogs` | OG 404 |
| legacy redirect 改回 raw `allBlogs` | legacy 404(而非 308) |
| `resolvePostNeighbors` 不處理 `-1` | hidden 回兩個 undefined |
| `isPublished` 忽略 `production` 參數 | `production: false` 保留 draft |
| 內部排序不複製陣列 | 輸入不變性 |
| pager 用 published 而非 listed 清單 | 最新文章只有 previous |

## Commit 序列

| # | 內容 | 驗收 |
| --- | --- | --- |
| 1 | `lib/post-publication.ts` + 完整單元測試(先寫會失敗的) | `test:unit` 由紅轉綠 |
| 2 | draft fixture + E2E spec(先寫會失敗的) | E2E 紅,證明缺陷存在 |
| 3 | 六個入口全部改用新入口 + 兩份手冊 | E2E 轉綠;既有測試組全綠 |
| 4 | OpenWiki 重生成(從已提交的乾淨 worktree 跑 `openwiki code --update --print`) | 生成頁差異已 review |

commit 2 先讓 E2E 紅,是為了證明這些洩漏**真的存在** —— 直接寫修復再寫測試,無法排除測試本身
是空包彈。

## 已知未處理問題(刻意留下)

1. sitemap / search index / series / 首頁 / archive / tag 仍各自過濾,只是現在有共用入口可用。
   逐一遷移需要 characterization tests,另案。
2. `pliny` 的 `sortPosts()` 原地排序是上游行為,本 PR 只在自己的 helper 內防禦(先複製),
   不修 pliny 也不包裝所有呼叫點。
