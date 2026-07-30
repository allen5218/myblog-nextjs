# 文章 publication policy 單一入口設計(PR1)

這條線原本是 `headerStyle: text`(PR2)的附帶發現 —— 當日日期的測試 fixture 會撞到 pager 斷言。
它與 hero 外觀在因果上無關,故獨立成本 PR,**先做**。

## 語意

| 欄位 | 語意(手冊 §草稿 vs. 隱藏) |
| --- | --- |
| `draft: true` | 未發佈。**production 全面排除** |
| `hidden: true` | 已發佈但不列出。可路徑直達,不進任何列表 |

### Truth table(規範)

| mode | draft | hidden | reachable(route / OG / alias) | listed(pager / 列表產物) |
| --- | --- | --- | --- | --- |
| production | ✓ | any | ✗ | ✗ |
| production | ✗ | ✓ | ✓ | ✗ |
| production | ✗ | ✗ | ✓ | ✓ |
| preview | ✓ | ✗ | ✓ | ✓ |
| preview | any | ✓ | ✓ | ✗ |
| preview | ✗ | ✗ | ✓ | ✓ |

`hidden` 在任何 mode 都移出 listed;`draft` 只在 production 生效(preview 保留寫作時的可見性)。

## 現況(全部經原始碼驗證)

| 位置 | 現況 | 後果 |
| --- | --- | --- |
| pliny `allCoreContent()` | production 才過濾 `draft` | 唯一的 draft 閘門,且只在 production |
| pliny 同檔頂層 | `isProduction` 在 **module load 時**快取 | vitest 是 `NODE_ENV=test`,單元測試無法用環境變數覆蓋 |
| pliny `sortPosts()` | `return allBlogs.sort(...)` | **原地 mutate 輸入** |
| 文章 route `Page()` | 同一份清單同時當 404 閘門與 pager 序列 | 兩職責綁死 |
| 同 route `generateMetadata()` | raw `findPost()` | draft 仍產生 metadata |
| 同 route `generateStaticParams()` | raw `allBlogs.map()` | draft 仍產生靜態路徑 |
| OG route 兩處 | raw `allBlogs` | **draft 的 `/opengraph-image` 仍回含標題的 PNG** |
| legacy `/blog/[...slug]` | raw `allBlogs.find(p => p.slug === s \|\| p.path === s \|\| p.legacyPath === s)` | **draft 仍 308,洩漏 canonical path**;且它接受**三種** identity |
| pager prev/next | 完全沒過濾 `hidden` | `data/blog/hidden/` 現有 6 篇全在公開 pager 鏈上 |
| `createTagCount()` | `(!isProduction \|\| file.draft !== true)` | 非 production 納入 draft |
| `createSearchIndex()` | `allCoreContent(...)` 包住 | draft 過濾同樣取決於 `isProduction` |
| `package.json` 的 `build` | `yarn contentlayer2 build` **沒有設 `NODE_ENV`** | 本機 `yarn build` 的 contentlayer 步驟可能是 development → **draft 會進 `app/tag-data.json` 與 `public/search.json`** |
| `dateSortDesc` | 日期相同回 `0` | `Array.sort` 穩定 → 同日文章維持來源順序,而來源順序來自目錄讀取,**跨檔案系統不保證一致**。現有同日文章:2026-07-13 ×2、2025-08-16 ×4 |

**目前沒有任何 `draft: true` fixture**,所以 draft 相關路徑從未被執行過。

## 目標

1. `lib/post-publication.ts` 成為 published/listed 政策的**唯一入口**。
2. 修掉 hidden 洩漏進公開 pager。
3. 修掉 draft 從 OG endpoint 與 legacy redirect 洩漏。
4. 修掉 draft 進入 `tag-data.json` / `search.json` 的環境相依漏洞 —— **由本 PR 擁有
   `runContentDerivedOutputs()` 並明確傳入 publication mode**,不再依賴 ambient `NODE_ENV`。
5. 保留 hidden 的路徑直達與 preview 的 draft 預覽。
6. 同日文章的排序**決定性化**。

## 非目標

- 不遷移首頁、年度頁、archive、tag 頁、series、sitemap 的**頁面層**過濾(產物層由目標 4 涵蓋)。
  逐一遷移需要 characterization tests,另案。
- 不改 `layout` 解析(見 memory `unused-starter-layouts`)。
- 不涉及 `headerStyle`(PR2 只在同一 orchestration 最前面插入 hero validator)。

## 架構

```ts
export type PublicationMode = 'production' | 'preview'

export type PostViews<T> = {
  readonly reachable: readonly T[] // route / OG / static params / alias
  readonly listed: readonly T[] // pager / 列表產物
}

export function selectPostViews<T>(posts: readonly T[], mode: PublicationMode): PostViews<T>

// identity 與 visibility 分離
export function findReachableByLegacyPath<T>(views: PostViews<T>, legacyPath: string): T | undefined
export function findReachableByAlias<T>(views: PostViews<T>, alias: string): T | undefined

export function resolvePostNeighbors<T>(
  views: PostViews<T>,
  legacyPath: string
): { prev?: T; next?: T }

export function publishedPostStaticParams(views: PostViews<Post>): LegacyParams[]
export function legacyParamsFromPath(legacyPath: string): LegacyParams
```

五個設計約束:

1. **`mode` 是 `'production' | 'preview'`,不是 `{ production: boolean }`。**
   `isPublished(post, { production: false }) === true` 這種讀起來像矛盾的語意不該擴散。
2. **mode 由參數注入,不讀 `process.env`。** pliny 在 module load 就快取 `isProduction`,
   單元測試無法用環境變數覆蓋。注入是唯一能同時覆蓋兩種 mode 的辦法。
3. **不得 mutate 輸入。** `sortPosts()` 原地 `.sort()`,所以內部排序前必須先複製。
4. **排序必須有決定性 tie-break。** 日期相同時以 `legacyPath` 字典序決勝,否則同日文章的
   prev/next 會隨檔案系統的目錄讀取順序漂移。
5. **identity 與 visibility 分開。** legacy route 接受 `slug` / `path` / `legacyPath` **三種**
   alias;一個籠統的 `findPublishedPost(posts, path)` 會讓 bare-slug alias 靜默失效。

### 三個必須分清楚的關注點

| 關注點 | 用什麼 | 錯誤後果 |
| --- | --- | --- |
| draft 的 404 閘門 | `findReachableByLegacyPath()` | 用 raw lookup → draft 從 404 變 200 |
| hidden 的 pager 排除 | `resolvePostNeighbors()`(內部用 `listed`) | 不做 → hidden 洩漏進公開導覽 |
| hidden 自己的頁面仍可訪問 | hidden 在 **`reachable`** 內 | 用 `listed` 當閘門 → hidden 404 |

**`-1` index 陷阱必須由 `resolvePostNeighbors()` 封裝。** 天真實作:

```ts
const index = listed.findIndex(...) // hidden 或不在序列 → -1
const prev = listed[index + 1]      // listed[0] —— 最新文章,不是 undefined
```

current 不在 listed 序列時必須明確回傳 `{ prev: undefined, next: undefined }`。

### Derived outputs 的 orchestration

```ts
// lib/content-outputs.ts
export async function runContentDerivedOutputs(posts, mode, deps) {
  const views = selectPostViews(posts, mode)
  deps.collectSeries(views.listed)
  await deps.createTagCount(views.listed) // 現況漏了 await
  deps.createSearchIndex(views.listed)
}
```

`contentlayer.config.ts` 的 `onSuccess` 必須 **`await` 或 `return`** 它 —— 見驗證章的突變測試。
mode 由呼叫端明確決定,不再讀 ambient `NODE_ENV`。PR2 只在最前面插入 hero validator。

### 各 route 的改法

```ts
const views = selectPostViews(allBlogs, mode)
const post = findReachableByLegacyPath(views, routePath(params))
if (!post) return notFound()
const { prev, next } = resolvePostNeighbors(views, routePath(params))
```

`generateMetadata()`、文章 route 與 OG route 的 `generateStaticParams()`、legacy redirect
(改用 `findReachableByAlias()`)全部改用同一組。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `lib/post-publication.ts` | 新增 |
| `lib/content-outputs.ts` | 新增:orchestration(可注入依賴) |
| `contentlayer.config.ts` | `onSuccess` 改為 `await runContentDerivedOutputs(...)`;writers 收 `listed` view |
| `app/[year]/[month]/[day]/[slug]/page.tsx` | `Page`、`generateMetadata`、`generateStaticParams` |
| `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx` | `generateStaticParams` 與 lookup |
| `app/blog/[...slug]/page.tsx` | 改用 `findReachableByAlias()` |
| **`tests/playwright/site-font-loading.spec.ts`** | **必改** —— 見下 |
| `data/blog/hidden/2026-07-30-draft-gate-test.md` | 新增 fixture:`draft: true`,**`hidden` 不設**,內容全 ASCII |
| `tests/unit/post-publication.test.ts` | 新增 |
| `tests/unit/content-outputs.test.ts` | 新增 |
| `tests/playwright/publication-policy.spec.ts` | 新增 |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都更新 draft/hidden 行為(含 OG、legacy alias、列表產物) |
| `AGENTS.md` / `CLAUDE.md` | 字型測試涵蓋範圍的措辭 |

### 字型 E2E 必須同步改,否則 `test:parity` 必然失敗

`site-font-loading.spec.ts` 讀 `.contentlayer/generated/Blog/_index.json` **迭代每一篇文章**,
並對每頁做 `page.locator('article').evaluate(...)`。修好 publication gate 之後 draft route 是
404 → 沒有 `<article>` → **測試必然失敗**。

改為量測所有「**production 可抵達**的文章」:hidden(非 draft)仍須量測;draft 排除,其 404 由
publication E2E 負責。同步修正 `AGENTS.md` 與 OpenWiki 裡「**全部**文章」的措辭為
「全部 production-reachable 文章」—— 那條守則的本意是「不可抽測」,不是「必須包含不可抵達的頁」。

### fixture 刻意只設 `draft: true`

**不設 `hidden`。** 兩個旗標都設會讓 fixture 剛好繞過目標 4 的漏洞(`createTagCount` 與
`createSearchIndex` 都先排除 `listed === false`),把真實缺陷遮住。只設 `draft` 才能證明政策
真的擋住了列表產物。

## 驗證

必過的 `ci` job 只跑 `contentlayer2 build`、`eslint`、`tsc --noEmit`、`test:unit`。
**Playwright 不是 CI gate**,故政策核心契約落在 unit 層;E2E 證明 route 真的接上了。
出貨前必須手動跑 `yarn test:parity` 全綠並在 PR 描述記錄。

### Unit:`post-publication`

- **完整 truth table 逐格驗證**(上表六列)
- hidden 的相鄰公開文章 prev/next 互指(跳過 hidden)
- **hidden 自己回 `{ prev: undefined, next: undefined }`**(釘死 `-1` 陷阱)
- **所有函式呼叫後輸入陣列的順序與內容不變**(釘死 `sortPosts` 原地排序)
- **同日文章的 prev/next 決定性**:打亂輸入順序,結果必須相同
- `findReachableByAlias()` 對 `slug`、`path`、`legacyPath` **三種** alias 都要命中
- `publishedPostStaticParams()`:draft 排除、hidden 保留
- `legacyParamsFromPath()` 的解析

### Unit:`content-outputs`

- writers 收到的是 `listed` view(hidden 與 production draft 都不在內)
- `production` mode:draft 不進任何 writer;`preview` mode:draft 進 writer
- `createTagCount` 確實被 await
- **`contentlayer.config.ts` 真的呼叫了 orchestration,且 callback 有 `await`/`return`**
  —— 見突變測試

### E2E:`publication-policy.spec.ts`(production build)

**draft fixture(negative controls):**

- canonical URL → **404**
- `/opengraph-image` → **404**
- legacy alias → **404**。必須用 `request.get(alias, { maxRedirects: 0 })` 並斷言**沒有
  `Location` header**。Playwright 預設**會跟隨 redirect**,所以「legacy 回 308 → 跟到 canonical
  → canonical 擋掉 → 最終 404」這條錯誤路徑也會看到 404 而假綠(既有的 redirect 測試就是用
  不跟隨的寫法)
- **404 HTML 不含該 draft 的唯一標題**
- **`public/search.json` 與 `app/tag-data.json` 不含該 draft**(釘死目標 4;這是 build 產物檢查,
  不是 HTTP)

**hidden 非 draft(positive controls,同樣重要):**

- canonical → **200**
- `/opengraph-image` → **200 且 content-type 是 PNG**
- legacy alias → **308 且 `Location` 精確等於 canonical**
- **不出現在任何 pager**

沒有這組正向控制,某個入口誤用 `listed` 而非 `reachable` 仍會通過全部負向測試。

**pager 邊界必須跨過 hidden cluster:**

「最新公開文章只有 previous」**守不住政策** —— 最新文章附近沒有 hidden 文章,pager 誤用
`reachable` 而非 `listed` 結果相同。必須測真正的邊界:hidden 文章群集在 2025-08-16(×4)、
2025-08-29、2025-09-08,其前後的公開文章是 2025-09-23 與 2021-04-30。

- 2025-09-23 的 previous 必須**直接指向 2021-04-30**
- 中間六篇 hidden 都不得出現在任何 pager
- 直接打開 hidden 文章 → 200,但 pager 為空

**不得依賴 PR2 之後才新增的 fixture** —— PR1 必須用現有內容自己證明這項政策。

### 突變測試

| 突變 | 應變紅 |
| --- | --- |
| 閘門改回 raw lookup | canonical 404 |
| OG route 改回 raw `allBlogs` | OG 404 |
| legacy redirect 改回 raw `allBlogs` | legacy 的「無 `Location`」斷言 |
| legacy 測試改成跟隨 redirect | 上一條會假綠 → 用正向控制的 308 + 精確 `Location` 交叉守 |
| pager 用 `reachable` 而非 `listed` | 2025-09-23 → 2021-04-30 的邊界 |
| `resolvePostNeighbors` 不處理 `-1` | hidden 回兩個 undefined |
| `selectPostViews` 忽略 `mode` | preview 保留 draft 那幾格 |
| 內部排序不複製陣列 | 輸入不變性 |
| 移除同日 tie-break | 打亂輸入的決定性測試 |
| writers 收 `reachable` 而非 `listed` | search.json / tag-data.json 不含 draft |
| 移除 `await createTagCount()` | orchestration await 斷言 |
| **`onSuccess` 改成 `async () => { runContentDerivedOutputs(...) }`(無 await/return)** | callback promise 必須在 orchestration 完成前維持 pending;rejection 必須傳回 contentlayer |
| 從 config 移除 orchestration 呼叫 | config wiring 斷言 |
| `findReachableByAlias` 只比 `legacyPath` | bare-slug 與 `path` 兩種 alias |

## Commit 序列

**不留永久紅的 commit。** 每個 commit 都必須是可部署的綠色狀態(Vercel 部署 main 的每個 commit)。
「先讓測試紅」是本機的鑑別步驟,不是入庫的狀態 —— 但**必須真的做**:寫完測試先在修復前跑一次
確認它紅,再把修復與測試一起提交。

| # | 內容 | 驗收 |
| --- | --- | --- |
| 1 | `lib/post-publication.ts` + 完整單元測試(含 truth table、不變性、決定性) | `test:unit` 綠 |
| 2 | `lib/content-outputs.ts` + `contentlayer.config.ts` 接線 + 其單元測試 | 產物內容不變(現況已是 production 行為);`test:unit` 綠 |
| 3 | 五個 route 入口改用新政策 + draft fixture + 字型 E2E 範圍調整 + publication E2E + 兩份手冊 + `AGENTS.md` 措辭 | E2E 綠(修復前先確認會紅);`test:parity` 全綠 |
| 4 | OpenWiki 重生成(從已提交的乾淨 worktree 跑 `openwiki code --update --print`) | 生成頁差異已 review |

commit 3 較大是刻意的:draft fixture 一旦入庫,字型 E2E 的範圍調整與 publication gate 必須同時
存在,否則 `test:parity` 會紅。

## 給 PR2 的交接條件

PR2 **必須以已合併 PR1 的新 main 為 base**,並在那之後重跑 build、`test:parity`、手冊檢查與
OpenWiki 重生成。兩條 sibling branch 各自生成 wiki 會衝突。

## 已知未處理問題(刻意留下)

1. 首頁、年度頁、archive、tag 頁、series、sitemap 的**頁面層**過濾仍各自實作,只是現在有共用入口
   可用。逐一遷移需要 characterization tests,另案。
2. pliny 的 `sortPosts()` 原地排序是上游行為,本 PR 只在自己的 helper 內防禦(先複製)。
