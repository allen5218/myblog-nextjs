# 文章 publication policy 單一入口設計(PR1)

原本是 `headerStyle: text`(PR2)的附帶發現 —— 當日日期的測試 fixture 會撞到 pager 斷言。
與 hero 外觀在因果上無關,故獨立成本 PR,**先做**。

**PR1 擁有 `lib/content-outputs.ts` 這個 seam。** PR2 只在既有 seam 最前面插入 hero validator,
**不得**另建一套 —— 否則會把本 PR 的 draft gate 倒退回去。

## 語意

| 欄位 | 語意(手冊 §草稿 vs. 隱藏) |
| --- | --- |
| `draft: true` | 未發佈。**production 全面排除** |
| `hidden: true` | 已發佈但不列出。可路徑直達,不進任何列表 |

### Truth table(規範)

| mode | draft | hidden | reachable(route / OG / alias / static params) | listed(pager / tag / search) |
| --- | --- | --- | --- | --- |
| production | ✓ | any | ✗ | ✗ |
| production | ✗ | ✓ | ✓ | ✗ |
| production | ✗ | ✗ | ✓ | ✓ |
| preview | ✓ | ✗ | ✓ | ✓ |
| preview | any | ✓ | ✓ | ✗ |
| preview | ✗ | ✗ | ✓ | ✓ |

`hidden` 在任何 mode 都移出 listed;`draft` 只在 production 生效(preview 保留寫作時的可見性)。

**series 不在這張表內** —— 見架構第 4 點,它是另一個 eligibility domain。

## 現況(全部經原始碼驗證)

| 位置 | 現況 | 後果 |
| --- | --- | --- |
| pliny `allCoreContent()` | production 才過濾 `draft` | 唯一的 draft 閘門,且只在 production |
| pliny 同檔頂層 | `isProduction` 在 **module load 時**快取 | vitest 是 `NODE_ENV=test`,無法用環境變數覆蓋 |
| pliny `sortPosts()` | `return allBlogs.sort(...)` | **原地 mutate 輸入** |
| `dateSortDesc` | 同日回 `0`;`Array.sort` 穩定 | 同日文章順序 = 目錄讀取順序,**跨檔案系統不保證**。現有同日:2026-07-13 ×2、2025-08-16 ×4 |
| 文章 route `Page()` | 同一份清單當 404 閘門與 pager 序列 | 兩職責綁死 |
| 同 route `generateMetadata()` | raw `findPost()` | draft 仍產生 metadata |
| 同 route `generateStaticParams()` | raw `allBlogs.map()` | draft 仍產生靜態路徑 |
| OG route 兩處 | raw `allBlogs` | **draft 的 `/opengraph-image` 仍回含標題的 PNG** |
| legacy `/blog/[...slug]` | raw `allBlogs.find(p => p.slug === s \|\| p.path === s \|\| p.legacyPath === s)` | **draft 仍 308 洩漏 canonical**;接受**三種** identity |
| pager prev/next | 沒過濾 `hidden` | `data/blog/hidden/` 現有 6 篇全在公開 pager 鏈上 |
| `createTagCount()` | 內部有 `file.listed !== false && (!isProduction \|\| file.draft !== true)` | writer 自己決定 visibility |
| `createSearchIndex()` | 內部用 `allCoreContent()` | 同上,且耦合 pliny 的 draft 判斷 |
| `package.json` 的 `build` | `yarn contentlayer2 build` **沒設 `NODE_ENV`** | contentlayer 步驟可能是 development → **draft 進 `app/tag-data.json` 與 `public/search.json`** |
| `scripts/dev.mjs` | `contentlayer2 build` 與 `contentlayer2 dev` **都沒有 mode** | 無法區分 authoring 與 production |
| `app/tag-data.json` | **被 git 追蹤** | 產物內容變動會造成工作樹 churn |
| `public/search.json` | **未被追蹤** | churn 無害 |
| `collectSeries()` | 對**每一篇**都先解析/驗證 series identity,`seriesIdentityForPost()` 才排除 hidden/draft | 傳入已過濾清單會**縮小驗證覆蓋範圍** |

**目前沒有任何 `draft: true` fixture**,所以 draft 相關路徑從未被執行過。

## 目標

1. `lib/post-publication.ts` 成為 reachable/listed 政策的**唯一入口**。
2. 修掉 hidden 洩漏進公開 pager。
3. 修掉 draft 從 OG endpoint 與 legacy redirect 洩漏。
4. 修掉 draft 進入 `tag-data.json` / `search.json` 的環境相依漏洞。
5. **writers 不再自行決定 visibility**(purity)。
6. **`PublicationMode` 有明確、可執行的來源**,且 fail-closed。
7. 同日文章排序決定性化。
8. 保留 hidden 路徑直達與 preview 的 draft 預覽。

## 非目標

- 不遷移首頁、年度頁、archive、tag 頁、series、sitemap 的**頁面層**過濾(產物層由目標 4/5 涵蓋)。
- **不改 `collectSeries()` 的資格邏輯**。
- 不改 `layout` 解析。
- 不涉及 `headerStyle`(PR2)。

## 架構

### 1. `PublicationMode` 的來源(composition boundary)

```ts
// lib/post-publication.ts
export type PublicationMode = 'production' | 'preview'

/** 缺省 production(fail-closed);非法值直接拋錯,不得 fail-open。 */
export function resolvePublicationMode(raw: string | undefined): PublicationMode
```

| 呼叫端 | mode 來源 |
| --- | --- |
| `contentlayer.config.ts` | `resolvePublicationMode(process.env.BLOG_PUBLICATION_MODE)` —— **未設 = production** |
| `scripts/dev.mjs` | 對 `contentlayer2 build` 與 `contentlayer2 dev` **都**注入 `BLOG_PUBLICATION_MODE=preview` |
| Next route(runtime) | `process.env.NODE_ENV === 'development' ? 'preview' : 'production'` |

**`yarn build` 不需要改** —— 未設環境變數就是 production,這正是 fail-closed 的意義。

**Vercel Preview Deployment 算 production。** 它是公開可達的 URL,draft 不得洩漏。這裡的
`preview` 只代表「本機 authoring」,**不要**因為名字相同而推導成 Vercel 的 Preview 環境。

### 2. Views:filter 與 sort 責任分離

```ts
export type PublicationPost = { draft?: boolean; hidden?: boolean; listed?: boolean }
export type DatedPost = PublicationPost & { date: string; legacyPath: string }
export type AliasRoutablePost = DatedPost & { slug: string; path: string }

export type PostViews<T> = {
  readonly reachable: readonly T[]
  readonly listed: readonly T[]
}

/** 只過濾,**保留輸入順序**,不排序、不 mutate。 */
export function selectPostViews<T extends PublicationPost>(
  posts: readonly T[],
  mode: PublicationMode
): PostViews<T>

/** date descending;同日以 legacyPath 的 **code-unit** 升冪 tie-break(不用 locale 比較)。 */
export function sortPostsForNavigation<T extends DatedPost>(posts: readonly T[]): T[]
```

**`selectPostViews()` 絕對不能排序。** tag writer 依 insertion order 建 key,排序會改變
`app/tag-data.json` 的 key 順序 —— 那個檔案被 git 追蹤,會與 commit 2 的「產物內容不變」矛盾。
只有 neighbor 與 search 明確呼叫 sorter。

### 3. Identity 與 visibility 分離

```ts
export function findReachableByLegacyPath<T extends DatedPost>(views: PostViews<T>, legacyPath: string): T | undefined
export function findReachableByAlias<T extends AliasRoutablePost>(views: PostViews<T>, alias: string): T | undefined
export function resolvePostNeighbors<T extends DatedPost>(views: PostViews<T>, legacyPath: string): { prev?: T; next?: T }
export function publishedPostStaticParams<T extends DatedPost>(views: PostViews<T>): LegacyParams[]
```

legacy route 接受 **`slug` / `path` / `legacyPath` 三種** alias;一個籠統的 `find(posts, path)`
會讓 bare-slug alias 靜默失效,所以 alias 查找是獨立函式並有獨立測試。

`LegacyParams` 與 `legacyParamsFromPath()` 移到 **`lib/legacy-url.ts`**(目前兩個 route 各自
重複定義 `LegacyParams`)。生成型別叫 **`Blog`**,不是 `Post`。

**`-1` index 陷阱由 `resolvePostNeighbors()` 封裝**:`list[-1 + 1]` 是 `list[0]`(最新文章),
不是 `undefined`。current 不在 listed 序列時必須明確回傳兩個 `undefined`。

**`readonly T[]` 的邊界**:`collectSeries()` 目前收 mutable `T[]`,呼叫時需在邊界複製
(`[...posts]`),不要把 `readonly` 洩漏成型別錯誤。

### 4. Orchestration seam(PR1 擁有,PR2 只擴充)

```ts
// lib/content-outputs.ts
export async function runContentDerivedOutputs(posts, mode, deps) {
  deps.assertValidHeroConfigurations?.(posts) // PR2 才注入;針對全部文章、最先執行
  deps.collectSeries([...posts])              // ← raw posts,不是 views.listed
  const views = selectPostViews(posts, mode)
  await deps.createTagCount(views.listed)
  deps.createSearchIndex(views.listed)
}
```

**`collectSeries` 必須收 raw posts。** 它對**每一篇**都先解析/驗證 series identity,才由
`seriesIdentityForPost()` 排除 hidden/draft;傳入已過濾清單會讓 hidden/draft 上的非法 series 值
不再讓 build 失敗 —— 那違反本 PR「不改 series 邏輯」的非目標。

而且 preview mode 的 truth table 把 draft 放進 listed,但 series **永久**排除 draft
(`seriesIdentityForPost()` 不看 mode)。**series 是獨立的 eligibility domain,不能用同一個
`listed` view 宣稱 series / tag / search 三者語意相同。**

`contentlayer.config.ts` 的 `onSuccess` 必須 **`await` 或 `return`** 它。

### 5. Writer purity

writers 不再決定 visibility:

- `createTagCount(posts)`:**移除** `file.listed !== false && (!isProduction || file.draft !== true)`,
  只保留 `file.tags` 的存在判斷。
- `createSearchIndex(posts)`:**不再使用 `allCoreContent()`**(它內含 pliny 的 draft 判斷),
  改為自己做 `coreContent` projection + 需要的排序,以維持輸出形狀不變。

只 spy「deps 收到什麼」抓不到這個問題 —— 在 `NODE_ENV=production` 下傳入 preview view,舊 writer
還是會把 draft 再次移除。**必須測 actual writer output。**

### 6. 各 route 的改法

```ts
const mode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, mode)
const post = findReachableByLegacyPath(views, routePath(params))
if (!post) return notFound()
const { prev, next } = resolvePostNeighbors(views, routePath(params))
```

五處入口:文章 route 的 `Page` / `generateMetadata` / `generateStaticParams`、OG route 的
`generateStaticParams` 與 lookup、legacy redirect(用 `findReachableByAlias`)。

## 檔案邊界

| 檔案 | 動作 |
| --- | --- |
| `lib/post-publication.ts` | 新增 |
| `lib/content-outputs.ts` | 新增(**PR1 擁有**) |
| `lib/legacy-url.ts` | 加入 `LegacyParams` 與 `legacyParamsFromPath()` |
| `contentlayer.config.ts` | `onSuccess` 改為 `await runContentDerivedOutputs(...)`;**兩個 writer 移除內部 visibility 判斷** |
| `scripts/dev.mjs` | 對兩個 contentlayer 子行程注入 `BLOG_PUBLICATION_MODE=preview` |
| `app/[year]/[month]/[day]/[slug]/page.tsx` | 三處入口;移除重複的 `LegacyParams` |
| `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx` | 兩處入口;移除重複的 `LegacyParams` |
| `app/blog/[...slug]/page.tsx` | 改用 `findReachableByAlias()` |
| `tests/playwright/site-font-loading.spec.ts` | **必改** —— 見下 |
| `data/blog/hidden/2026-07-30-draft-gate-test.md` | 新增 fixture:`draft: true`、**不設 `hidden`**、**不設 `tags`**、全 ASCII、唯一標題 |
| `tests/unit/post-publication.test.ts` | 新增 |
| `tests/unit/content-outputs.test.ts` | 新增 |
| `tests/unit/content-writers.test.ts` | 新增:actual writer output |
| `tests/playwright/publication-policy.spec.ts` | 新增 |
| `docs/functionality-settings-manual.zh-TW.md` / `.md` | 兩份都更新 draft/hidden 行為(含 OG、legacy alias、列表產物、`BLOG_PUBLICATION_MODE`) |
| `AGENTS.md` / `CLAUDE.md` | 字型測試涵蓋範圍措辭 + `BLOG_PUBLICATION_MODE` 的存在 |

### 字型 E2E 必須同步改,否則 `test:parity` 必然失敗

`site-font-loading.spec.ts` 讀 `.contentlayer/generated/Blog/_index.json` **迭代每一篇文章**,
並對每頁做 `page.locator('article').evaluate(...)`。修好 gate 之後 draft route 是 404 →
沒有 `<article>` → **測試必然失敗**。

改為量測所有「**production 可抵達**」的文章:hidden(非 draft)仍須量測;draft 排除。同步修正
`AGENTS.md` 裡「**全部**文章」的措辭為「全部 production-reachable 文章」—— 那條守則的本意是
「不可抽測」,不是「必須包含不可抵達的頁」。

### fixture 的三個刻意選擇

1. **只設 `draft`,不設 `hidden`** —— 兩個都設會剛好繞過目標 4/5 的漏洞(舊 writers 都先排除
   `listed === false`),把真實缺陷遮住。
2. **不設 `tags`** —— `app/tag-data.json` **被 git 追蹤**。若 fixture 帶唯一 tag 且 preview mode
   讓 draft 進 tag writer,每次 `yarn dev` 都會把它改成含 sentinel、production build 又移除,
   憑空製造一個類似 `next-env.d.ts` 的永久工作樹 churn。
3. **唯一 ASCII 標題** —— 供 `search.json` 的存在性斷言(該檔未被追蹤,churn 無害)。

**writer purity 與 view-swap 的鑑別改在 unit 層做**(合成 post + actual writer output),不靠
內容 fixture。理由:production 下 draft 同時不在 `reachable` 也不在 `listed`,**兩個 view 的輸出
完全相同** —— 只有 hidden 非 draft 能鑑別 view 傳錯,而為此在內容裡加唯一 tag 會回到上面的
churn 問題,還會動到字型預算。

## 驗證

必過的 `ci` job 只跑 `contentlayer2 build`、`eslint`、`tsc --noEmit`、`test:unit`。
**Playwright 不是 CI gate**,故核心契約落在 unit 層;E2E 證明 route 真的接上了。
出貨前手動跑 `yarn test:parity` 全綠並在 PR 描述記錄。

### Unit:`post-publication`

- **truth table 六列逐格驗證**
- `resolvePublicationMode`:未設 → `production`;`'preview'` → preview;**非法值拋錯**
- hidden 的相鄰公開文章 prev/next 互指;**hidden 自己回兩個 `undefined`**(釘死 `-1`)
- **所有函式呼叫後輸入陣列的順序與內容不變**
- **`selectPostViews()` 保留輸入順序**(不排序)
- **`sortPostsForNavigation()` 的同日順序 exact 斷言** —— 不可只測「打亂後結果一致」,
  反向排序也會通過那種測法
- `findReachableByAlias()` 對 `slug`、`path`、`legacyPath` 三種 alias 都命中
- `publishedPostStaticParams()`:draft 排除、hidden 保留

### Unit:`content-writers`(actual output)

用合成 posts(含 draft、hidden、正常各一,且各有唯一 tag 與標題)直接呼叫 writer,檢查**寫出的
內容**:

- 傳入 `listed` view → 產物不含 hidden 的唯一 tag / 唯一標題
- **傳入 `reachable` view → 產物含 hidden 的唯一 tag / 標題**(這是 view-swap mutation 唯一的
  鑑別點)
- `preview` mode 下 draft 在 `listed` → 產物**含** draft(證明 writer 不再自行排除)
- tag key 的 insertion order 與過濾前相同

### Unit:`content-outputs`

- `collectSeries` 收到的是 **raw posts**(含 hidden 與 draft),不是 `listed`
- `createTagCount` / `createSearchIndex` 收到的是 `listed`
- `createTagCount` 確實被 await
- **`contentlayer.config.ts` 真的呼叫了 orchestration,且 callback 有 `await`/`return`**

### Unit:route wiring

`generateStaticParams`(文章與 OG **各自**)與 `generateMetadata` 都要有 route-level 的
adapter/export 測試 —— runtime lookup 回 404 **證明不了** static params 沒有偷偷改回 raw
`allBlogs`。三處各自突變。

### E2E:`publication-policy.spec.ts`(production build)

**draft fixture(negative):**

- canonical → **404**;`/opengraph-image` → **404**
- legacy alias → **404**,用 `request.get(alias, { maxRedirects: 0 })` 並斷言**沒有 `Location`**
  (Playwright 預設會跟隨 redirect,「308 → canonical → 擋掉 → 404」也會看到 404 而假綠)
- **404 HTML 不含該 draft 的唯一標題**
- **`public/search.json` 不含該唯一標題**

**hidden 非 draft(positive,同等重要):**

- canonical → **200**,且**精確 `<title>`**、canonical metadata、Open Graph metadata 都正確
  (只驗 200 守不住 `generateMetadata()`)
- `/opengraph-image` → **200 且 content-type 為 PNG**
- legacy alias → **308 且 `Location` 精確等於 canonical**
- 不出現在任何 pager

**pager 邊界必須跨過 hidden cluster:** hidden 群集在 2025-08-16(×4)、2025-08-29、2025-09-08,
前後的公開文章是 2025-09-23 與 2021-04-30。

- 2025-09-23 的 previous 必須**直接指向 2021-04-30**
- 那六篇 hidden 都不得出現在任何 pager
- 直接打開 hidden → 200,但 pager 為空

「最新文章只有 previous」**守不住政策**(最新文章附近沒有 hidden)。不得依賴 PR2 之後才新增的
fixture。

### 突變測試

| 突變 | 應變紅 |
| --- | --- |
| 閘門改回 raw lookup | canonical 404 |
| OG lookup 改回 raw `allBlogs` | OG 404 |
| 文章 `generateStaticParams` 改回 raw | route wiring 測試 |
| OG `generateStaticParams` 改回 raw | 同上(**另一條**) |
| `generateMetadata` 改回 raw | hidden 的精確 `<title>` / metadata |
| legacy redirect 改回 raw | legacy 的「無 `Location`」斷言 |
| legacy 測試改成跟隨 redirect | 正向控制的 308 + 精確 `Location` 交叉守 |
| pager 用 `reachable` | 2025-09-23 → 2021-04-30 邊界 |
| **writers 收 `reachable`** | `content-writers` 的 hidden 唯一 tag/標題 |
| **writer 保留內部 `isProduction` 判斷** | `preview` mode 下 draft 應進產物 |
| `collectSeries` 改收 `views.listed` | `content-outputs` 的 raw posts 斷言 |
| `resolvePostNeighbors` 不處理 `-1` | hidden 回兩個 undefined |
| `selectPostViews` 忽略 `mode` | preview 那幾格 |
| `selectPostViews` 順便排序 | tag key insertion order |
| 移除同日 tie-break | exact 同日順序 |
| `resolvePublicationMode` 對非法值 fail-open | 拋錯斷言 |
| 內部排序不複製陣列 | 輸入不變性 |
| 移除 `await createTagCount()` | orchestration await |
| `onSuccess` 寫成 `async () => { run...(...) }`(無 await/return) | callback promise 在 orchestration 完成前必須 pending;rejection 必須傳回 contentlayer |
| 從 config 移除 orchestration 呼叫 | config wiring |
| `findReachableByAlias` 只比 `legacyPath` | bare-slug 與 `path` 兩種 alias |

## Commit 序列

**不留永久紅的 commit**(Vercel 部署 main 每個 commit)。「先讓測試紅」是本機的鑑別步驟 ——
**但必須真的做**:寫完測試先在修復前跑一次確認它紅,再把修復與測試一起提交。

| # | 內容 | 驗收 |
| --- | --- | --- |
| 1 | `lib/post-publication.ts` + `lib/legacy-url.ts` 的 `LegacyParams` + 完整單元測試 | `test:unit` 綠 |
| 2 | writer purity + `lib/content-outputs.ts` + `onSuccess` 接線 + `scripts/dev.mjs` 的 mode + 三支單元測試 | **`app/tag-data.json` 與 `public/search.json` 內容零變動**(production mode 下等值) |
| 3 | 五處 route 入口 + route wiring 測試 + draft fixture + 字型 E2E 範圍調整 + publication E2E + 兩份手冊 + `AGENTS.md` | E2E 綠(修復前先確認會紅);`test:parity` 全綠 |
| 4 | OpenWiki 重生成(從已提交的乾淨 worktree 跑 `openwiki code --update --print`) | 生成頁差異已 review |

commit 2 的驗收是**產物 byte 級零變動** —— writer purity 是等值重構,若 `tag-data.json` 有 diff
就代表 view 或順序做錯了。commit 3 較大是刻意的:draft fixture 一旦入庫,字型 E2E 的範圍調整與
gate 必須同時存在,否則 `test:parity` 會紅。

## 給 PR2 的交接條件

1. PR2 **必須以已合併 PR1 的新 main 為 base**,之後重跑 build、`test:parity`、手冊檢查與
   OpenWiki 重生成。兩條 sibling branch 各自生成 wiki 會衝突。
2. PR2 **不得新建** `lib/content-outputs.ts` —— 只在既有 `deps` 加上
   `assertValidHeroConfigurations`,並讓它成為第一個執行的動作。

## 已知未處理問題(刻意留下)

1. 首頁、年度頁、archive、tag 頁、series、sitemap 的**頁面層**過濾仍各自實作,只是現在有共用
   入口可用。逐一遷移需要 characterization tests,另案。
2. pliny 的 `sortPosts()` 原地排序是上游行為,本 PR 只在自己的 helper 內防禦(先複製)。
3. `series` 的 eligibility 與 `listed` 語意不同(永久排除 draft、不看 mode),刻意未統一。
