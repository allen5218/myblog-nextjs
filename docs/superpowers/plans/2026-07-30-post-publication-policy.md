# Post publication policy 實作計畫(PR1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `lib/post-publication.ts` 作為 draft/hidden 可見性政策的唯一入口,修掉 hidden 洩漏
進公開 pager、draft 從 OG endpoint 與 legacy redirect 洩漏、以及 draft 進入 `tag-data.json` /
`search.json` 的環境相依漏洞。

**Architecture:** 一個純函式模組把 `allBlogs` 投影成兩個 readonly view(`reachable` 給 route /
OG / static params / alias,`listed` 給 pager 與列表產物)。過濾與排序責任分離。derived-output
writers 變成 pure(不再自己判斷 visibility),由一個可注入依賴的 orchestration 餵給它們正確的
view。mode 由呼叫端明確提供,缺省 production(fail-closed)。

**Tech Stack:** Next.js 16 App Router、contentlayer2、pliny utils、vitest(unit)、
Playwright(parity,非 CI gate)。

**規範來源:** `docs/superpowers/specs/2026-07-30-post-publication-policy-design.md`

## Global Constraints

- 語言:程式碼註解與文件用**繁體中文**;commit message 用**英文** conventional 格式。
- **`next-env.d.ts` 一律排除在 commit 外**,永遠用明確的 `git add <檔案清單>`,不要用 `git add -A`。
- **不直接 push `main`**:先 `git fetch origin main` 並確認 `git rev-list --left-right --count main...origin/main` 右側為 `0`,再開分支 → PR。
- 每個 commit 都必須是**綠色可部署**狀態(Vercel 部署 main 的每個 commit)。「先讓測試紅」是本機鑑別步驟,不是入庫狀態。
- 必過 CI 只跑:`yarn contentlayer2 build`、`yarn eslint app components lib layouts scripts`、`yarn tsc --noEmit`、`yarn test:unit`。**Playwright 不是 gate**,出貨前手動跑 `yarn test:parity`。
- 互動驗證**一律用 production build**,不得用 dev server。production server 綁 `127.0.0.1:3012`,**驗證完必須關閉該程序**。
- `vitest` 只收 `tests/unit/**/*.test.ts`。
- 單元測試風格照既有慣例:`import { describe, expect, test } from 'vitest'`,以相對路徑 import(例:`'../../lib/series'`),用工廠函式建 fixture。
- `PublicationMode` 只有兩個字面值:`'production'` | `'preview'`。**Vercel Preview Deployment 算 production**。
- **`app/tag-data.json` 被 git 追蹤**;`public/search.json` 未被追蹤。
- 型別名稱:contentlayer 生成的是 **`Blog`**,不是 `Post`。

---

## File Structure

| 檔案 | 責任 |
| --- | --- |
| `lib/post-publication.ts`(新增) | mode 解析、views 投影、導覽排序、finders、neighbors、static params。**純函式,無 I/O、無 `process.env`** |
| `lib/legacy-url.ts`(修改) | 既有的 path 產生器 + 新增 `LegacyParams` 型別與 `legacyParamsFromPath()` / `legacyPathFromParams()` |
| `lib/content-outputs.ts`(新增) | orchestration seam:依序執行 hero validator(PR2 才注入)、`collectSeries`、tag、search。**PR1 擁有此檔** |
| `contentlayer.config.ts`(修改) | 兩個 writer 移除內部 visibility 判斷;`onSuccess` 改為 `await runContentDerivedOutputs(...)` |
| `scripts/dev.mjs`(修改) | 對兩個 contentlayer 子行程注入 `BLOG_PUBLICATION_MODE=preview` |
| `app/[year]/[month]/[day]/[slug]/page.tsx`(修改) | 三處入口改用政策;移除本地 `LegacyParams` 與 `findPost` |
| `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`(修改) | 兩處入口改用政策;移除本地 `LegacyParams` |
| `app/blog/[...slug]/page.tsx`(修改) | alias lookup 改用 `findReachableByAlias()` |
| `data/blog/hidden/2026-07-30-draft-gate-test.md`(新增) | draft 閘門 fixture:`draft: true`、**不設 `hidden`**、**不設 `tags`**、全 ASCII、唯一標題 |
| `tests/unit/post-publication.test.ts`(新增) | truth table、排序決定性、輸入不變性、finders、`-1` 陷阱 |
| `tests/unit/legacy-url.test.ts`(新增) | `legacyParamsFromPath` / `legacyPathFromParams` |
| `tests/unit/content-writers.test.ts`(新增) | **actual writer output**(不是 spy 參數) |
| `tests/unit/content-outputs.test.ts`(新增) | orchestration 順序、raw vs listed、await、config wiring |
| `tests/unit/route-publication-wiring.test.ts`(新增) | 三個 route 檔案的 wiring 斷言(正向 + 反向) |
| `tests/playwright/publication-policy.spec.ts`(新增) | draft negative、hidden positive、pager 邊界 |
| `tests/playwright/site-font-loading.spec.ts`(修改) | 量測範圍改為 production-reachable |
| `docs/functionality-settings-manual.zh-TW.md` / `.md`(修改) | draft/hidden 行為 + `BLOG_PUBLICATION_MODE` |
| `AGENTS.md`(修改) | 字型測試「全部文章」措辭 + `BLOG_PUBLICATION_MODE` |

**Commit 對應:** Task 1–3 → commit 1;Task 4–5 → commit 2;Task 6–9 → commit 3;Task 10 → commit 4。

---

## Task 0: 準備分支

- [ ] **Step 1: 確認基底沒有落後遠端**

```bash
git fetch origin main && git rev-list --left-right --count main...origin/main
```

Expected: 右側(behind)為 `0`。若不為 0,先同步到最新 `origin/main` 再繼續。

- [ ] **Step 2: 開分支**

```bash
git checkout -b feat/post-publication-policy
```

Expected: `已切換至新分支「feat/post-publication-policy」`

---

## Task 1: `legacy-url` 的 params 型別與轉換

**Files:**
- Modify: `lib/legacy-url.ts`
- Test: `tests/unit/legacy-url.test.ts`(新增)

**Interfaces:**
- Consumes: 無
- Produces:
  - `type LegacyParams = { year: string; month: string; day: string; slug: string }`
  - `legacyParamsFromPath(legacyPath: string): LegacyParams`
  - `legacyPathFromParams(params: LegacyParams): string`

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/legacy-url.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { legacyParamsFromPath, legacyPathFromParams } from '../../lib/legacy-url'

describe('legacy url params', () => {
  test('把 legacyPath 拆成 route params', () => {
    expect(legacyParamsFromPath('2026/07/25/openwiki-tame-agents-md')).toEqual({
      year: '2026',
      month: '07',
      day: '25',
      slug: 'openwiki-tame-agents-md',
    })
  })

  test('params 轉回 legacyPath 是往返一致的', () => {
    const path = '2021/04/30/typora-latex-mathjax'
    expect(legacyPathFromParams(legacyParamsFromPath(path))).toBe(path)
  })

  test('slug 含斜線時保留完整 slug', () => {
    expect(legacyParamsFromPath('2026/07/25/a/b')).toEqual({
      year: '2026',
      month: '07',
      day: '25',
      slug: 'a/b',
    })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/legacy-url.test.ts`
Expected: FAIL —— `legacyParamsFromPath` 不存在(`No "legacyParamsFromPath" export is defined`)

- [ ] **Step 3: 實作**

Append to `lib/legacy-url.ts`:

```ts
export type LegacyParams = {
  year: string
  month: string
  day: string
  slug: string
}

export function legacyParamsFromPath(legacyPath: string): LegacyParams {
  const [year, month, day, ...rest] = legacyPath.split('/')
  return { year, month, day, slug: rest.join('/') }
}

export function legacyPathFromParams(params: LegacyParams): string {
  return `${params.year}/${params.month}/${params.day}/${params.slug}`
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/legacy-url.test.ts`
Expected: PASS(3 tests)

---

## Task 2: mode 解析、views 投影、導覽排序

**Files:**
- Create: `lib/post-publication.ts`
- Test: `tests/unit/post-publication.test.ts`(新增)

**Interfaces:**
- Consumes: 無
- Produces:
  - `type PublicationMode = 'production' | 'preview'`
  - `type PublicationPost = { draft?: boolean; hidden?: boolean; listed?: boolean }`
  - `type DatedPost = PublicationPost & { date: string; legacyPath: string }`
  - `type AliasRoutablePost = DatedPost & { slug: string; path: string }`
  - `type PostViews<T> = { readonly reachable: readonly T[]; readonly listed: readonly T[] }`
  - `resolvePublicationMode(raw: string | undefined): PublicationMode`
  - `selectPostViews<T extends PublicationPost>(posts: readonly T[], mode: PublicationMode): PostViews<T>`
  - `sortPostsForNavigation<T extends DatedPost>(posts: readonly T[]): T[]`

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/post-publication.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  resolvePublicationMode,
  selectPostViews,
  sortPostsForNavigation,
} from '../../lib/post-publication'

const post = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-07-25T00:00:00.000Z',
  legacyPath: '2026/07/25/normal',
  slug: 'normal',
  path: '2026/07/25/normal',
  ...overrides,
})

describe('publication mode', () => {
  test('未設或空字串一律視為 production(fail-closed)', () => {
    expect(resolvePublicationMode(undefined)).toBe('production')
    expect(resolvePublicationMode('')).toBe('production')
  })

  test('接受兩個合法字面值', () => {
    expect(resolvePublicationMode('production')).toBe('production')
    expect(resolvePublicationMode('preview')).toBe('preview')
  })

  test('非法值直接拋錯,不得 fail-open', () => {
    expect(() => resolvePublicationMode('prod')).toThrow(/BLOG_PUBLICATION_MODE/)
    expect(() => resolvePublicationMode('PREVIEW')).toThrow(/BLOG_PUBLICATION_MODE/)
  })
})

describe('publication views truth table', () => {
  const draft = post({ legacyPath: '2026/07/25/draft', draft: true })
  const hidden = post({ legacyPath: '2026/07/25/hidden', hidden: true, listed: false })
  const normal = post({ legacyPath: '2026/07/25/normal' })
  const draftHidden = post({
    legacyPath: '2026/07/25/draft-hidden',
    draft: true,
    hidden: true,
    listed: false,
  })
  const all = [draft, hidden, normal, draftHidden]

  test('production:draft 兩個 view 都排除', () => {
    const views = selectPostViews(all, 'production')
    expect(views.reachable).toEqual([hidden, normal])
    expect(views.listed).toEqual([normal])
  })

  test('preview:draft 可達且列出,但 hidden 永不列出', () => {
    const views = selectPostViews(all, 'preview')
    expect(views.reachable).toEqual([draft, hidden, normal, draftHidden])
    expect(views.listed).toEqual([draft, normal])
  })

  test('不 mutate 輸入,也不排序', () => {
    const input = [normal, draft, hidden]
    const snapshot = [...input]
    selectPostViews(input, 'production')
    expect(input).toEqual(snapshot)
    expect(selectPostViews(input, 'preview').reachable).toEqual([normal, draft, hidden])
  })
})

describe('navigation sort', () => {
  const older = post({ date: '2021-04-30T00:00:00.000Z', legacyPath: '2021/04/30/older' })
  const sameDayB = post({ date: '2025-08-16T00:00:00.000Z', legacyPath: '2025/08/16/b-post' })
  const sameDayA = post({ date: '2025-08-16T00:00:00.000Z', legacyPath: '2025/08/16/a-post' })
  const newest = post({ date: '2026-07-25T00:00:00.000Z', legacyPath: '2026/07/25/newest' })

  test('日期新到舊,同日以 legacyPath 升冪 tie-break', () => {
    expect(sortPostsForNavigation([sameDayB, newest, older, sameDayA])).toEqual([
      newest,
      sameDayA,
      sameDayB,
      older,
    ])
  })

  test('輸入順序不影響結果,且不 mutate 輸入', () => {
    const input = [older, sameDayA, newest, sameDayB]
    const snapshot = [...input]
    const forward = sortPostsForNavigation(input)
    const reversed = sortPostsForNavigation([...input].reverse())
    expect(forward).toEqual(reversed)
    expect(input).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/post-publication.test.ts`
Expected: FAIL —— `Failed to load ../../lib/post-publication`(檔案不存在)

- [ ] **Step 3: 實作**

Create `lib/post-publication.ts`:

```ts
import { legacyParamsFromPath, type LegacyParams } from './legacy-url'

export type PublicationMode = 'production' | 'preview'

/** 只描述可見性所需的欄位;刻意不綁 contentlayer 的 Blog,單元測試才能用輕量 fixture。 */
export type PublicationPost = {
  draft?: boolean
  hidden?: boolean
  listed?: boolean
}

export type DatedPost = PublicationPost & {
  date: string
  legacyPath: string
}

export type AliasRoutablePost = DatedPost & {
  slug: string
  path: string
}

export type PostViews<T> = {
  /** route / OG / static params / alias 可抵達的文章。 */
  readonly reachable: readonly T[]
  /** pager 與列表產物(tag、search)可列出的文章。 */
  readonly listed: readonly T[]
}

/**
 * mode 一律由呼叫端明確提供。缺省 production 是刻意的 fail-closed:漏設環境變數時
 * 應該是「draft 被擋掉」,而不是「draft 洩漏到公開網址」。
 */
export function resolvePublicationMode(raw: string | undefined): PublicationMode {
  if (raw === undefined || raw === '') return 'production'
  if (raw === 'production' || raw === 'preview') return raw
  throw new Error(
    `BLOG_PUBLICATION_MODE must be "production" or "preview" (received ${JSON.stringify(raw)})`
  )
}

function isReachable(post: PublicationPost, mode: PublicationMode): boolean {
  return !(mode === 'production' && post.draft === true)
}

function isListed(post: PublicationPost, mode: PublicationMode): boolean {
  if (!isReachable(post, mode)) return false
  return post.hidden !== true && post.listed !== false
}

/**
 * 只過濾,**保留輸入順序**。刻意不排序:tag writer 依 insertion order 建 key,
 * 而 app/tag-data.json 被 git 追蹤,排序會造成產物 diff。
 */
export function selectPostViews<T extends PublicationPost>(
  posts: readonly T[],
  mode: PublicationMode
): PostViews<T> {
  const reachable: T[] = []
  const listed: T[] = []
  for (const post of posts) {
    if (!isReachable(post, mode)) continue
    reachable.push(post)
    if (isListed(post, mode)) listed.push(post)
  }
  return { reachable, listed }
}

/**
 * 日期新到舊。同日必須有決定性 tie-break —— pliny 的 dateSortDesc 同日回 0,
 * 而穩定排序會沿用目錄讀取順序,跨檔案系統不保證一致(現有同日文章:2026-07-13 ×2、
 * 2025-08-16 ×4)。用 code-unit 比較而非 localeCompare,避免受 locale 影響。
 */
export function sortPostsForNavigation<T extends DatedPost>(posts: readonly T[]): T[] {
  return [...posts].sort((left, right) => {
    const byDate = Date.parse(right.date) - Date.parse(left.date)
    if (byDate !== 0) return byDate
    if (left.legacyPath < right.legacyPath) return -1
    if (left.legacyPath > right.legacyPath) return 1
    return 0
  })
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/post-publication.test.ts`
Expected: PASS(8 tests)

---

## Task 3: finders、neighbors、static params

**Files:**
- Modify: `lib/post-publication.ts`
- Test: `tests/unit/post-publication.test.ts`(追加)

**Interfaces:**
- Consumes: Task 1 的 `LegacyParams` / `legacyParamsFromPath`;Task 2 的 `PostViews` / `sortPostsForNavigation`
- Produces:
  - `findReachableByLegacyPath<T extends DatedPost>(views: PostViews<T>, legacyPath: string): T | undefined`
  - `findReachableByAlias<T extends AliasRoutablePost>(views: PostViews<T>, alias: string): T | undefined`
  - `resolvePostNeighbors<T extends DatedPost>(views: PostViews<T>, legacyPath: string): { prev?: T; next?: T }`
  - `publishedPostStaticParams<T extends DatedPost>(views: PostViews<T>): LegacyParams[]`

- [ ] **Step 1: 寫會失敗的測試**

Append to `tests/unit/post-publication.test.ts`(並把 import 補上四個新名稱):

```ts
describe('finders and neighbours', () => {
  const older = post({ date: '2021-04-30T00:00:00.000Z', legacyPath: '2021/04/30/older', slug: 'older', path: '2021/04/30/older' })
  const hiddenMid = post({ date: '2025-08-16T00:00:00.000Z', legacyPath: '2025/08/16/mid', slug: 'mid', path: '2025/08/16/mid', hidden: true, listed: false })
  const newer = post({ date: '2025-09-23T00:00:00.000Z', legacyPath: '2025/09/23/newer', slug: 'newer', path: '2025/09/23/newer' })
  const draft = post({ date: '2026-07-30T00:00:00.000Z', legacyPath: '2026/07/30/draft', slug: 'draft', path: '2026/07/30/draft', draft: true })
  const views = selectPostViews([newer, hiddenMid, older, draft], 'production')

  test('legacyPath 查找只在 reachable 內,draft 找不到', () => {
    expect(findReachableByLegacyPath(views, '2025/08/16/mid')).toBe(hiddenMid)
    expect(findReachableByLegacyPath(views, '2026/07/30/draft')).toBeUndefined()
  })

  test('alias 查找同時支援 slug、path、legacyPath 三種形式', () => {
    expect(findReachableByAlias(views, 'newer')).toBe(newer)
    expect(findReachableByAlias(views, '2025/09/23/newer')).toBe(newer)
    expect(findReachableByAlias(views, 'draft')).toBeUndefined()
  })

  test('pager 跳過 hidden,直接連到下一篇公開文章', () => {
    expect(resolvePostNeighbors(views, '2025/09/23/newer')).toEqual({ prev: older, next: undefined })
    expect(resolvePostNeighbors(views, '2021/04/30/older')).toEqual({ prev: undefined, next: newer })
  })

  test('hidden 文章本身沒有 prev/next —— 不得因 -1 index 回傳最新文章', () => {
    expect(resolvePostNeighbors(views, '2025/08/16/mid')).toEqual({})
  })

  test('static params 排除 draft、保留 hidden', () => {
    expect(publishedPostStaticParams(views)).toEqual([
      { year: '2025', month: '09', day: '23', slug: 'newer' },
      { year: '2025', month: '08', day: '16', slug: 'mid' },
      { year: '2021', month: '04', day: '30', slug: 'older' },
    ])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/post-publication.test.ts`
Expected: FAIL —— `findReachableByLegacyPath is not defined`

- [ ] **Step 3: 實作**

Append to `lib/post-publication.ts`:

```ts
export function findReachableByLegacyPath<T extends DatedPost>(
  views: PostViews<T>,
  legacyPath: string
): T | undefined {
  return views.reachable.find((post) => post.legacyPath === legacyPath)
}

/**
 * legacy /blog/... alias 歷史上接受三種 identity。獨立成一個函式(而不是併進
 * findReachableByLegacyPath)是為了讓 bare-slug 這條路徑有自己的測試 —— 用一個籠統的
 * find(posts, path) 很容易讓它靜默失效。
 */
export function findReachableByAlias<T extends AliasRoutablePost>(
  views: PostViews<T>,
  alias: string
): T | undefined {
  return views.reachable.find(
    (post) => post.slug === alias || post.path === alias || post.legacyPath === alias
  )
}

/**
 * 封裝 -1 index 陷阱:當前文章不在 listed 序列(例如 hidden)時,天真實作的
 * list[-1 + 1] 會回傳 list[0],也就是最新文章。必須明確回傳兩個 undefined。
 */
export function resolvePostNeighbors<T extends DatedPost>(
  views: PostViews<T>,
  legacyPath: string
): { prev?: T; next?: T } {
  const ordered = sortPostsForNavigation(views.listed)
  const index = ordered.findIndex((post) => post.legacyPath === legacyPath)
  if (index === -1) return {}
  return { prev: ordered[index + 1], next: ordered[index - 1] }
}

export function publishedPostStaticParams<T extends DatedPost>(
  views: PostViews<T>
): LegacyParams[] {
  return views.reachable.map((post) => legacyParamsFromPath(post.legacyPath))
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/post-publication.test.ts`
Expected: PASS(13 tests)

- [ ] **Step 5: 型別與 lint**

```bash
yarn tsc --noEmit && yarn eslint lib tests
```

Expected: 兩者皆無輸出(通過)

- [ ] **Step 6: Commit(commit 1)**

```bash
git add lib/post-publication.ts lib/legacy-url.ts tests/unit/post-publication.test.ts tests/unit/legacy-url.test.ts
git commit -m "feat: add post publication policy primitives

Introduces lib/post-publication.ts as the single place that decides which posts
are reachable (routes, OG images, static params, aliases) and which are listed
(pager, tag and search artefacts).

Three constraints are baked in rather than left to callers. The mode is an
explicit argument with a fail-closed production default, because pliny caches
NODE_ENV at module load and a missing environment variable must not leak drafts.
Filtering never sorts, because tag keys follow insertion order and
app/tag-data.json is tracked. Same-day posts get a code-unit tie-break, since
dateSortDesc returns 0 and stable sort otherwise inherits directory read order.

resolvePostNeighbors absorbs the -1 index trap: a post outside the listed
sequence would otherwise get list[0] as its previous link.

Nothing calls these yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: writer purity(actual output 測試)

**Files:**
- Modify: `contentlayer.config.ts`(`createTagCount` 與 `createSearchIndex`)
- Test: `tests/unit/content-writers.test.ts`(新增)

**背景:** 兩個 writer 目前自己判斷 visibility —— `createTagCount` 讀 module-level `isProduction`、
`createSearchIndex` 用 pliny 的 `allCoreContent()`。只 spy「deps 收到什麼」抓不到這個問題:在
`NODE_ENV=production` 下即使傳入 preview view,舊 writer 還是會把 draft 再次移除。

**Interfaces:**
- Consumes: 無(writer 只收要寫出的文章清單)
- Produces:
  - `createTagCount(posts: readonly BlogLike[]): Promise<void>` —— 只看 `posts[].tags`
  - `createSearchIndex(posts: readonly BlogLike[]): void` —— 只做 `coreContent` projection + `sortPosts`

**注意:** 這兩個函式目前不是 `export`。為了能單元測試,把它們改成 `export`(contentlayer 的
config 檔可以有額外 export,不影響 `makeSource`)。

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/content-writers.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { createSearchIndex, createTagCount } from '../../contentlayer.config'
import { selectPostViews } from '../../lib/post-publication'

const post = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-07-25T00:00:00.000Z',
  legacyPath: '2026/07/25/normal',
  path: '2026/07/25/normal',
  slug: 'normal',
  title: 'Normal Post',
  tags: ['normal-tag'],
  body: { raw: '', code: '' },
  _raw: {},
  _id: 'normal',
  ...overrides,
})

const normal = post()
const hidden = post({
  legacyPath: '2026/07/24/hidden',
  path: '2026/07/24/hidden',
  slug: 'hidden',
  title: 'Hidden Sentinel Title',
  tags: ['hidden-sentinel-tag'],
  hidden: true,
  listed: false,
  _id: 'hidden',
})
const draft = post({
  legacyPath: '2026/07/23/draft',
  path: '2026/07/23/draft',
  slug: 'draft',
  title: 'Draft Sentinel Title',
  tags: ['draft-sentinel-tag'],
  draft: true,
  _id: 'draft',
})
const all = [normal, hidden, draft]

function readTagData() {
  return readFileSync('./app/tag-data.json', 'utf8')
}

function readSearchIndex() {
  return readFileSync('./public/search.json', 'utf8')
}

describe('derived output writers are pure', () => {
  test('傳入 listed view 時,產物不含 hidden 的 sentinel', async () => {
    const views = selectPostViews(all, 'production')
    await createTagCount(views.listed)
    createSearchIndex(views.listed)
    expect(readTagData()).not.toContain('hidden-sentinel-tag')
    expect(readSearchIndex()).not.toContain('Hidden Sentinel Title')
  })

  // 這是 view-swap mutation 唯一的鑑別點:production 下 draft 同時不在 reachable
  // 也不在 listed,兩個 view 的輸出完全相同,只有 hidden 能分辨傳錯了 view。
  test('傳入 reachable view 時,產物會含 hidden 的 sentinel', async () => {
    const views = selectPostViews(all, 'production')
    await createTagCount(views.reachable)
    createSearchIndex(views.reachable)
    expect(readTagData()).toContain('hidden-sentinel-tag')
    expect(readSearchIndex()).toContain('Hidden Sentinel Title')
  })

  // 證明 writer 不再自己排除 draft —— 若它保留內部 isProduction 判斷,這條會紅。
  test('preview view 含 draft 時,writer 必須照寫', async () => {
    const views = selectPostViews(all, 'preview')
    await createTagCount(views.listed)
    createSearchIndex(views.listed)
    expect(readTagData()).toContain('draft-sentinel-tag')
    expect(readSearchIndex()).toContain('Draft Sentinel Title')
  })
})
```

> **測試會覆寫真實產物。** 最後一個步驟會用真實內容重新生成,所以測試順序上把「還原」交給
> Step 5 的 `yarn contentlayer2 build`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/content-writers.test.ts`
Expected: FAIL —— `No "createTagCount" export is defined on ../../contentlayer.config`

- [ ] **Step 3: 讓 writer 變 pure**

在 `contentlayer.config.ts` 中,把 `createTagCount` 改成:

```ts
/**
 * 只負責寫出傳進來的文章的 tag 統計。**不做任何 visibility 判斷** ——
 * 那是 lib/post-publication.ts 的責任。以前這裡自己讀 module-level isProduction,
 * 導致「傳入正確 view」也可能被 writer 二次過濾。
 */
export async function createTagCount(allBlogs) {
  const tagCount: Record<string, number> = {}
  allBlogs.forEach((file) => {
    if (file.tags) {
      file.tags.forEach((tag) => {
        const formattedTag = slug(tag)
        if (formattedTag in tagCount) {
          tagCount[formattedTag] += 1
        } else {
          tagCount[formattedTag] = 1
        }
      })
    }
  })
  const formatted = await prettier.format(JSON.stringify(tagCount, null, 2), { parser: 'json' })
  writeFileSync('./app/tag-data.json', formatted)
}
```

把 `createSearchIndex` 改成:

```ts
/**
 * 同上:不做 visibility 判斷。刻意不用 pliny 的 allCoreContent() —— 它內含
 * production-only 的 draft 過濾。改為自己做 coreContent projection 以維持輸出形狀不變。
 * sortPosts 會原地排序,所以先複製。
 */
export function createSearchIndex(allBlogs) {
  if (
    siteMetadata?.search?.provider === 'kbar' &&
    siteMetadata.search.kbarConfig.searchDocumentsPath
  ) {
    writeFileSync(
      `public/${path.basename(siteMetadata.search.kbarConfig.searchDocumentsPath)}`,
      JSON.stringify(sortPosts([...allBlogs]).map((post) => coreContent(post)))
    )
    console.log('Local search index generated...')
  }
}
```

在檔案頂部的 pliny import 加上 `coreContent`:

```ts
import { allCoreContent, coreContent, sortPosts } from 'pliny/utils/contentlayer.js'
```

> `allCoreContent` 仍被 computed fields 之外的地方使用嗎?若 `yarn eslint` 報未使用,
> 就把它從 import 移除。

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/content-writers.test.ts`
Expected: PASS(3 tests)

- [ ] **Step 5: 用真實內容重新生成產物,確認零 diff**

```bash
yarn contentlayer2 build && git diff --stat app/tag-data.json
```

Expected: `git diff --stat` **無輸出** —— writer purity 是等值重構,production 下產物必須 byte 相同。
若有 diff,停手檢查:多半是 view 傳錯或順序做錯了。

---

## Task 5: orchestration seam 與 mode 來源

**Files:**
- Create: `lib/content-outputs.ts`
- Modify: `contentlayer.config.ts`(`onSuccess`)
- Modify: `scripts/dev.mjs`
- Test: `tests/unit/content-outputs.test.ts`(新增)

**Interfaces:**
- Consumes: Task 2 的 `selectPostViews` / `resolvePublicationMode` / `PublicationMode` / `PublicationPost`;Task 4 的 pure writers
- Produces:
  - `type ContentOutputDeps<T>` —— 見下
  - `runContentDerivedOutputs<T extends PublicationPost>(posts: readonly T[], mode: PublicationMode, deps: ContentOutputDeps<T>): Promise<void>`
  - **PR2 只會在 `deps` 加上 `assertValidHeroConfigurations`,不得新建這個檔案**

- [ ] **Step 1: 寫會失敗的測試**

Create `tests/unit/content-outputs.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { runContentDerivedOutputs } from '../../lib/content-outputs'

const post = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-07-25T00:00:00.000Z',
  legacyPath: '2026/07/25/normal',
  title: 'Normal',
  ...overrides,
})

const normal = post()
const hidden = post({ legacyPath: '2026/07/24/hidden', hidden: true, listed: false })
const draft = post({ legacyPath: '2026/07/23/draft', draft: true })

function deps() {
  return {
    assertValidHeroConfigurations: vi.fn(),
    collectSeries: vi.fn(),
    createTagCount: vi.fn().mockResolvedValue(undefined),
    createSearchIndex: vi.fn(),
  }
}

describe('content derived outputs orchestration', () => {
  test('validator 最先執行,且收到全部文章(不是過濾後的 view)', async () => {
    const d = deps()
    const order: string[] = []
    d.assertValidHeroConfigurations.mockImplementation(() => order.push('validator'))
    d.collectSeries.mockImplementation(() => order.push('series'))
    d.createTagCount.mockImplementation(async () => void order.push('tag'))
    d.createSearchIndex.mockImplementation(() => order.push('search'))

    await runContentDerivedOutputs([normal, hidden, draft], 'production', d)

    expect(order).toEqual(['validator', 'series', 'tag', 'search'])
    expect(d.assertValidHeroConfigurations.mock.calls[0][0]).toHaveLength(3)
  })

  // collectSeries 對每一篇都先解析/驗證 series identity,才由 seriesIdentityForPost
  // 排除 hidden/draft。傳入已過濾清單會縮小驗證覆蓋範圍。
  test('collectSeries 收 raw posts;tag 與 search 收 listed', async () => {
    const d = deps()
    await runContentDerivedOutputs([normal, hidden, draft], 'production', d)

    expect(d.collectSeries.mock.calls[0][0]).toHaveLength(3)
    expect(d.createTagCount.mock.calls[0][0]).toEqual([normal])
    expect(d.createSearchIndex.mock.calls[0][0]).toEqual([normal])
  })

  test('preview mode 讓 draft 進 listed,hidden 仍排除', async () => {
    const d = deps()
    await runContentDerivedOutputs([normal, hidden, draft], 'preview', d)
    expect(d.createTagCount.mock.calls[0][0]).toEqual([normal, draft])
  })

  test('缺少 validator 時不拋錯(PR2 才注入)', async () => {
    const d = deps()
    const { assertValidHeroConfigurations: _omitted, ...withoutValidator } = d
    await expect(
      runContentDerivedOutputs([normal], 'production', withoutValidator)
    ).resolves.toBeUndefined()
  })

  test('createTagCount 被 await —— 它 reject 時整個 orchestration 必須 reject', async () => {
    const d = deps()
    d.createTagCount.mockRejectedValue(new Error('tag writer failed'))
    await expect(runContentDerivedOutputs([normal], 'production', d)).rejects.toThrow(
      'tag writer failed'
    )
  })
})

describe('contentlayer config wiring', () => {
  const source = readFileSync('./contentlayer.config.ts', 'utf8')

  test('onSuccess 有 await 這個 orchestration', () => {
    expect(source).toContain('await runContentDerivedOutputs(')
  })

  test('onSuccess 不再直接呼叫 writers', () => {
    expect(source).not.toMatch(/onSuccess[\s\S]*?createTagCount\(allBlogs\)/)
    expect(source).not.toMatch(/onSuccess[\s\S]*?createSearchIndex\(allBlogs\)/)
  })

  test('mode 來自 BLOG_PUBLICATION_MODE 且經過 resolvePublicationMode', () => {
    expect(source).toContain('resolvePublicationMode(process.env.BLOG_PUBLICATION_MODE)')
  })
})

describe('dev script publication mode', () => {
  const source = readFileSync('./scripts/dev.mjs', 'utf8')

  test('兩個 contentlayer 子行程都注入 preview', () => {
    expect(source).toMatch(/contentlayer2['"],\s*['"]build['"]\][\s\S]{0,80}BLOG_PUBLICATION_MODE/)
    expect(source).toMatch(/contentlayer2['"],\s*['"]dev['"]\][\s\S]{0,80}BLOG_PUBLICATION_MODE/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/content-outputs.test.ts`
Expected: FAIL —— `Failed to load ../../lib/content-outputs`

- [ ] **Step 3: 實作 orchestration**

Create `lib/content-outputs.ts`:

```ts
import {
  selectPostViews,
  type PublicationMode,
  type PublicationPost,
} from './post-publication'

export type ContentOutputDeps<T> = {
  /** PR2(headerStyle: text)才會注入。針對全部文章、最先執行。 */
  assertValidHeroConfigurations?: (posts: readonly T[]) => void
  collectSeries: (posts: T[]) => unknown
  createTagCount: (posts: readonly T[]) => Promise<void>
  createSearchIndex: (posts: readonly T[]) => void
}

/**
 * contentlayer 的 onSuccess 唯一該做的事。抽出來是為了讓「驗證必須在任何
 * project-owned 產物寫出之前」這個順序可以被測試 —— 驗證若排在後面,無效 frontmatter
 * 會先污染 app/tag-data.json 與 public/search.json,形成「build 失敗但工作樹已被改動」。
 *
 * collectSeries 刻意收 raw posts:它對每一篇都先解析/驗證 series identity,
 * 才由 seriesIdentityForPost() 排除 hidden/draft。傳入已過濾清單會讓 hidden/draft 上的
 * 非法 series 值不再讓 build 失敗。series 是獨立的 eligibility domain(永久排除 draft、
 * 不看 mode),不能用同一個 listed view 代表 series/tag/search 三者。
 */
export async function runContentDerivedOutputs<T extends PublicationPost>(
  posts: readonly T[],
  mode: PublicationMode,
  deps: ContentOutputDeps<T>
): Promise<void> {
  deps.assertValidHeroConfigurations?.(posts)
  deps.collectSeries([...posts])

  const views = selectPostViews(posts, mode)
  await deps.createTagCount(views.listed)
  deps.createSearchIndex(views.listed)
}
```

- [ ] **Step 4: 接上 contentlayer config**

在 `contentlayer.config.ts` 頂部加 import:

```ts
import { runContentDerivedOutputs } from './lib/content-outputs'
import { resolvePublicationMode } from './lib/post-publication'
```

把 `onSuccess` 換成:

```ts
  onSuccess: async (importData) => {
    const { allBlogs } = await importData()
    await runContentDerivedOutputs(
      allBlogs,
      resolvePublicationMode(process.env.BLOG_PUBLICATION_MODE),
      { collectSeries, createTagCount, createSearchIndex }
    )
  },
```

- [ ] **Step 5: 讓 dev 明確走 preview**

在 `scripts/dev.mjs` 把 `runYarn` 改成可帶環境變數:

```js
function runYarn(args, env) {
  // Windows 上執行 yarn.cmd 必須帶 shell:true —— CVE-2024-27980 修補後的 Node
  // (含本專案要求的 20.9+)對 .cmd/.bat 直接 spawn 會拋 EINVAL。
  return spawn('yarn', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: env ? { ...process.env, ...env } : process.env,
  })
}
```

把兩個 contentlayer 呼叫改成(`next dev` 不變):

```js
// 本機 authoring 才看得到 draft。production build 不設這個變數,fail-closed 成 production。
const previewEnv = { BLOG_PUBLICATION_MODE: 'preview' }

const contentlayerBuild = runYarn(['contentlayer2', 'build'], previewEnv)
```

以及 watcher:

```js
    contentlayerWatcher = runYarn(['contentlayer2', 'dev'], previewEnv)
```

- [ ] **Step 6: 跑測試確認通過**

Run: `yarn vitest run tests/unit/content-outputs.test.ts`
Expected: PASS(8 tests)

- [ ] **Step 7: 全套檢查 + 產物零 diff**

```bash
yarn contentlayer2 build && yarn tsc --noEmit && yarn eslint app components lib layouts scripts && yarn test:unit && git diff --stat app/tag-data.json
```

Expected: 全部通過,且 `git diff --stat app/tag-data.json` **無輸出**。

- [ ] **Step 8: Commit(commit 2)**

```bash
git add contentlayer.config.ts lib/content-outputs.ts scripts/dev.mjs tests/unit/content-writers.test.ts tests/unit/content-outputs.test.ts
git commit -m "refactor: make derived output writers pure and give mode a source

The tag and search writers were deciding visibility themselves -- one read
pliny's module-load isProduction, the other wrapped allCoreContent -- so handing
them a correctly filtered view changed nothing under NODE_ENV=production. They
now write exactly the posts they are given, and the tests assert real file
contents rather than what a spy received, since a spy cannot see this.

The orchestration seam makes the ordering testable: validation must run before
any project-owned artefact is written, or invalid front matter pollutes
tag-data.json and search.json in a build that then fails. collectSeries keeps
receiving raw posts, because it validates every document's series identity
before excluding hidden and draft, and because series excludes drafts
unconditionally while the preview view includes them -- one listed view cannot
speak for series, tag and search alike.

Publication mode now has a real source. yarn build sets no NODE_ENV, so
contentlayer defaults to production and dev.mjs passes preview to both child
processes. An unrecognised value throws instead of failing open.

app/tag-data.json is unchanged, which is the acceptance criterion for this being
an equivalent refactor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 五處 route 入口

**Files:**
- Modify: `app/[year]/[month]/[day]/[slug]/page.tsx`
- Modify: `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`
- Modify: `app/blog/[...slug]/page.tsx`
- Test: `tests/unit/route-publication-wiring.test.ts`(新增)

**Interfaces:**
- Consumes: Task 2/3 的全部 exports;Task 1 的 `LegacyParams` / `legacyPathFromParams`
- Produces: 無新 API(只有 route 行為改變)

- [ ] **Step 1: 寫會失敗的 wiring 測試**

Create `tests/unit/route-publication-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// 這一層刻意用原始碼檢查而非 import route module:route 會 import
// contentlayer/generated,直接 import 會讓 test:unit 依賴先跑過 contentlayer2 build。
// 沿用 tests/unit/series-rendering.test.ts 既有的檔案契約寫法。
// 限制:它證明「呼叫了正確的政策函式」,不證明執行期結果 —— 後者由 E2E 負責。
const articleRoute = readFileSync('./app/[year]/[month]/[day]/[slug]/page.tsx', 'utf8')
const ogRoute = readFileSync('./app/[year]/[month]/[day]/[slug]/opengraph-image.tsx', 'utf8')
const legacyRoute = readFileSync('./app/blog/[...slug]/page.tsx', 'utf8')

describe('article route uses the publication policy', () => {
  test('三處入口都改用政策函式', () => {
    expect(articleRoute).toContain('selectPostViews(')
    expect(articleRoute).toContain('findReachableByLegacyPath(')
    expect(articleRoute).toContain('resolvePostNeighbors(')
    expect(articleRoute).toContain('publishedPostStaticParams(')
  })

  test('不再直接查找或列舉 raw allBlogs', () => {
    expect(articleRoute).not.toContain('allBlogs.find(')
    expect(articleRoute).not.toContain('allBlogs.map(')
  })
})

describe('og image route uses the publication policy', () => {
  test('lookup 與 static params 都改用政策函式', () => {
    expect(ogRoute).toContain('selectPostViews(')
    expect(ogRoute).toContain('findReachableByLegacyPath(')
    expect(ogRoute).toContain('publishedPostStaticParams(')
  })

  test('不再直接查找或列舉 raw allBlogs', () => {
    expect(ogRoute).not.toContain('allBlogs.find(')
    expect(ogRoute).not.toContain('allBlogs.map(')
  })
})

describe('legacy alias route uses the publication policy', () => {
  test('用 alias 專用的查找', () => {
    expect(legacyRoute).toContain('findReachableByAlias(')
  })

  test('不再直接查找 raw allBlogs', () => {
    expect(legacyRoute).not.toContain('allBlogs.find(')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/route-publication-wiring.test.ts`
Expected: FAIL —— `expected '...' to contain 'selectPostViews('`

- [ ] **Step 3: 改文章 route**

在 `app/[year]/[month]/[day]/[slug]/page.tsx`:

移除本地的 `type LegacyParams`、`routePath()`、`findPost()`,改為 import 與 module-level views:

```ts
import { coreContent } from 'pliny/utils/contentlayer'
import {
  findReachableByLegacyPath,
  publishedPostStaticParams,
  resolvePostNeighbors,
  selectPostViews,
} from '@/lib/post-publication'
import { legacyPathFromParams, type LegacyParams } from '@/lib/legacy-url'

// NODE_ENV 在 runtime 固定,所以 views 只算一次。
const publicationMode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, publicationMode)
```

`generateMetadata` 的 lookup:

```ts
  const post = findReachableByLegacyPath(views, legacyPathFromParams(params))
```

`generateStaticParams`:

```ts
export const generateStaticParams = async () => publishedPostStaticParams(views)
```

`Page` 的開頭(取代 `sortedCoreContents` / `postIndex` / `prev` / `next` / `findPost`):

```ts
export default async function Page(props: { params: Promise<LegacyParams> }) {
  const params = await props.params
  const legacyPath = legacyPathFromParams(params)
  const post = findReachableByLegacyPath(views, legacyPath)

  if (!post) {
    return notFound()
  }

  const neighbors = resolvePostNeighbors(views, legacyPath)
  const prev = neighbors.prev && coreContent(neighbors.prev)
  const next = neighbors.next && coreContent(neighbors.next)
```

> 其餘部分(`authorList`、`mainContent`、`jsonLd`、`Layout`)不動。原本的
> `const post = findPost(params) as Blog` 那一行刪除 —— `post` 已經在閘門處取得。

- [ ] **Step 4: 改 OG route**

在 `app/[year]/[month]/[day]/[slug]/opengraph-image.tsx`:

移除本地 `type LegacyParams` 與 `routePath()`,加入:

```ts
import {
  findReachableByLegacyPath,
  publishedPostStaticParams,
  selectPostViews,
} from '@/lib/post-publication'
import { legacyPathFromParams, type LegacyParams } from '@/lib/legacy-url'

const publicationMode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, publicationMode)
```

`generateStaticParams`:

```ts
export const generateStaticParams = async () => publishedPostStaticParams(views)
```

lookup:

```ts
  const post = findReachableByLegacyPath(views, legacyPathFromParams(resolvedParams))
```

- [ ] **Step 5: 改 legacy alias route**

把 `app/blog/[...slug]/page.tsx` 換成:

```ts
import { allBlogs } from 'contentlayer/generated'
import { notFound, permanentRedirect } from 'next/navigation'
import { findReachableByAlias, selectPostViews } from '@/lib/post-publication'

const publicationMode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, publicationMode)

export const generateStaticParams = async () => []

export default async function Page(props: { params: Promise<{ slug: string[] }> }) {
  const params = await props.params
  const alias = decodeURI(params.slug.join('/'))
  const post = findReachableByAlias(views, alias)

  if (!post) {
    return notFound()
  }

  permanentRedirect(`/${post.legacyPath}/`)
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `yarn vitest run tests/unit/route-publication-wiring.test.ts`
Expected: PASS(6 tests)

- [ ] **Step 7: 型別與 lint**

```bash
yarn contentlayer2 build && yarn tsc --noEmit && yarn eslint app components lib layouts scripts
```

Expected: 全部通過。若 `Blog` 或 `sortPosts`/`allCoreContent` 變成未使用,從 import 移除。

---

## Task 7: draft fixture 與字型測試範圍

**Files:**
- Create: `data/blog/hidden/2026-07-30-draft-gate-test.md`
- Modify: `tests/playwright/site-font-loading.spec.ts`

**Interfaces:**
- Consumes: Task 6 的 route 行為
- Produces: fixture 的唯一標題字串 `Draft Gate Sentinel Post`,供 Task 8 的 E2E 使用

- [ ] **Step 1: 建立 fixture**

Create `data/blog/hidden/2026-07-30-draft-gate-test.md`:

```markdown
---
layout: post
title: "Draft Gate Sentinel Post"
subtitle: "Production must never serve this page"
date: 2026-07-30
author: "Claude"
draft: true
---

This draft exists only to prove the publication gate works. Three deliberate choices:

It sets `draft: true` and does **not** set `hidden`. Setting both would slip past the very
hole this fixture must expose, because the derived output writers already drop unlisted posts.

It has no `tags`. The file `app/tag-data.json` is tracked by git, so a unique tag plus preview
mode would rewrite it on every `yarn dev` and strip it again on every production build.

Its title is unique and ASCII only, so the search index assertion can look for it and the
Chiron font budget gains no new code points.
```

- [ ] **Step 2: 確認字型測試現在會失敗**

```bash
yarn contentlayer2 build && yarn build && yarn playwright test tests/playwright/site-font-loading.spec.ts 2>&1 | tail -20
```

Expected: FAIL —— draft 那一頁的 test 因為找不到 `article` 元素而失敗(route 回 404)。
**這是刻意的鑑別步驟**,證明下一步的範圍調整是必要的。

- [ ] **Step 3: 調整字型測試範圍**

在 `tests/playwright/site-font-loading.spec.ts`,把 articles 的來源改成只含 production 可抵達的
文章。把原本的:

```ts
).map(({ path }) => ({ label: path, path: `/${path}/` }))
```

改成(同時把 `as { path: string }[]` 擴充成含 `draft`):

```ts
  ) as { path: string; draft?: boolean }[]
)
  // production 抵達不了的文章沒有 <article> 可量。draft 的 404 由
  // publication-policy.spec.ts 負責;這裡的「不可抽測」原則仍然成立 ——
  // 涵蓋的是全部 production-reachable 文章,不是取樣。
  .filter((article) => article.draft !== true)
  .map(({ path }) => ({ label: path, path: `/${path}/` }))
```

- [ ] **Step 4: 確認字型測試恢復通過**

```bash
yarn playwright test tests/playwright/site-font-loading.spec.ts 2>&1 | tail -5
```

Expected: 全部 PASS。

- [ ] **Step 5: 確認字型預算沒有被 fixture 影響**

```bash
yarn check:site-font --full
```

Expected: 通過。fixture 全 ASCII,不應新增任何 bucket。

---

## Task 8: publication E2E

**Files:**
- Create: `tests/playwright/publication-policy.spec.ts`

**Interfaces:**
- Consumes: Task 7 的 fixture 標題 `Draft Gate Sentinel Post`;既有 hidden 文章 `/2025/08/16/catalog-test/`
- Produces: 無

- [ ] **Step 1: 寫測試**

Create `tests/playwright/publication-policy.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const draftCanonical = '/2026/07/30/draft-gate-test/'
const draftAlias = '/blog/draft-gate-test/'
const draftTitle = 'Draft Gate Sentinel Post'

const hiddenCanonical = '/2025/08/16/catalog-test/'
const hiddenAlias = '/blog/catalog-test/'

// hidden 群集在 2025-08-16(×4)、2025-08-29、2025-09-08,其前後的公開文章。
// 「最新文章只有 previous」守不住政策 —— 最新文章附近沒有 hidden 文章,
// pager 誤用 reachable 而非 listed 的結果完全相同。
const publicAfterHiddenCluster = '/2025/09/23/claude-code-jekyll-blog-journey/'
const publicBeforeHiddenCluster = '/2021/04/30/typora-latex-mathjax/'

test('production 不供應 draft 的任何公開入口', async ({ page, request }) => {
  expect((await request.get(draftCanonical)).status()).toBe(404)
  expect((await request.get(`${draftCanonical}opengraph-image`)).status()).toBe(404)

  // Playwright 預設會跟隨 redirect。若 legacy route 仍回 308 而 canonical 才擋掉,
  // 跟隨之後同樣是 404 —— 那會讓錯誤實作綠燈。必須不跟隨並確認沒有 Location。
  const alias = await request.get(draftAlias, { maxRedirects: 0 })
  expect(alias.status()).toBe(404)
  expect(alias.headers()['location']).toBeUndefined()

  await page.goto(draftCanonical)
  expect(await page.content()).not.toContain(draftTitle)

  expect(readFileSync('public/search.json', 'utf8')).not.toContain(draftTitle)
})

test('hidden 文章仍完整可達,只是不列出', async ({ page, request }) => {
  expect((await request.get(hiddenCanonical)).status()).toBe(200)

  const og = await request.get(`${hiddenCanonical}opengraph-image`)
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toContain('image/png')

  // 正向控制:證明 legacy route 沒有被整條改成 404,也證明上一個測試的
  // 「無 Location」斷言真的有鑑別力。
  const alias = await request.get(hiddenAlias, { maxRedirects: 0 })
  expect(alias.status()).toBe(308)
  expect(alias.headers()['location']).toBe(hiddenCanonical)

  // metadata 的接線:只驗 200 守不住 generateMetadata()。
  await page.goto(hiddenCanonical)
  await expect(page).toHaveTitle(/catalog/i)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /catalog-test/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/)

  await expect(page.locator('.post-container > .pager li')).toHaveCount(0)
})

test('pager 跨過 hidden 群集直接連到下一篇公開文章', async ({ page }) => {
  await page.goto(publicAfterHiddenCluster)
  const previous = page.locator('.post-container > .pager .previous a')
  await expect(previous).toHaveAttribute('href', publicBeforeHiddenCluster)

  await page.goto(publicBeforeHiddenCluster)
  const next = page.locator('.post-container > .pager .next a')
  await expect(next).toHaveAttribute('href', publicAfterHiddenCluster)
})
```

> **執行前確認兩個路徑常數。** `publicAfterHiddenCluster` 與 `publicBeforeHiddenCluster` 必須是
> hidden 群集前後**真正最近**的公開文章。用
> `ls data/blog/*.md | sort` 對照 `ls data/blog/hidden/*.md | sort` 核對;若不符就改成實際值。

- [ ] **Step 2: 跑 production build 與測試**

```bash
yarn build && yarn playwright test tests/playwright/publication-policy.spec.ts 2>&1 | tail -20
```

Expected: 全部 PASS。若 pager 那條紅,先核對上面的兩個路徑常數。

- [ ] **Step 3: 跑完整 parity 套件**

```bash
yarn test:parity 2>&1 | tail -20
```

Expected: 全部 PASS(**Playwright 不是 CI gate,所以這一步必須手動做並記錄結果**)。

---

## Task 9: 文件

**Files:**
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify: `docs/functionality-settings-manual.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1–8 的全部行為
- Produces: 無

- [ ] **Step 1: 更新兩份手冊的 draft/hidden 章節**

在「草稿 vs. 隱藏」那一節補上(中英文各一份,內容等義):

- `draft: true` 在 production 排除的**全部**入口:文章網址、`/opengraph-image`、
  `/blog/...` legacy alias、prev/next pager、`app/tag-data.json`、`public/search.json`。
- `hidden: true` 仍可路徑直達,並且 legacy alias 仍會 308;但不進任何列表與 pager。
- 新環境變數 **`BLOG_PUBLICATION_MODE`**:未設 = `production`(fail-closed);
  `yarn dev` 會自動設成 `preview` 讓 draft 在本機可見;非法值會讓 build 失敗。
  **Vercel Preview Deployment 算 production**,draft 不會出現在那裡。

- [ ] **Step 2: 更新 AGENTS.md 的字型測試措辭**

把字型測試「**必須涵蓋全部文章**」改為「**必須涵蓋全部 production-reachable 文章**
(draft 的 404 由 `publication-policy.spec.ts` 負責);原則仍是不可抽測」。
同一節補一句 `BLOG_PUBLICATION_MODE` 的存在與 fail-closed 語意。

- [ ] **Step 3: 確認兩份手冊同步**

```bash
grep -c "BLOG_PUBLICATION_MODE" docs/functionality-settings-manual.zh-TW.md docs/functionality-settings-manual.md
```

Expected: 兩個檔案都 ≥ 1。

- [ ] **Step 4: 全套檢查**

```bash
yarn contentlayer2 build && yarn eslint app components lib layouts scripts && yarn tsc --noEmit && yarn test:unit && yarn check:site-font --full
```

Expected: 全部通過。

- [ ] **Step 5: Commit(commit 3)**

```bash
git add "app/[year]/[month]/[day]/[slug]/page.tsx" "app/[year]/[month]/[day]/[slug]/opengraph-image.tsx" "app/blog/[...slug]/page.tsx" data/blog/hidden/2026-07-30-draft-gate-test.md tests/unit/route-publication-wiring.test.ts tests/playwright/publication-policy.spec.ts tests/playwright/site-font-loading.spec.ts docs/functionality-settings-manual.zh-TW.md docs/functionality-settings-manual.md AGENTS.md app/tag-data.json
git commit -m "fix: stop serving drafts from every public post entrance

A draft used to 404 as a page while still serving an /opengraph-image PNG
bearing its title and a 308 revealing its canonical path, because the OG route
and the legacy alias both read raw allBlogs. Hidden posts, meanwhile, sat in the
public prev/next chain: all six of them.

All five entrances now go through the publication policy, and the article route
stops conflating its 404 gate with its pager sequence -- the same list did both,
so hidden posts had to be either navigable or unreachable.

The draft fixture required widening the font spec's scope. It iterates every
generated article and requires an <article> element, so a route that correctly
404s fails it. The rule it encodes is \"no sampling\", not \"include unreachable
pages\", so it now covers every production-reachable article and the wording in
AGENTS.md says so.

The E2E deliberately does not follow redirects when checking the alias: a route
that still 308s to a canonical page which then rejects the draft would report
404 and pass. A positive control asserts the hidden post's alias does 308 with
an exact Location, so the negative case cannot go green by the route being
broken outright. The pager assertion crosses the hidden cluster from 2025-09-23
to 2021-04-30, because the newest post has no hidden neighbours and would look
identical either way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: OpenWiki 重生成

**Files:**
- Modify: `openwiki/**`(生成產物,**不得手改**)

- [ ] **Step 1: 從已提交的狀態建乾淨 worktree**

```bash
git worktree add /tmp/openwiki-regen feat/post-publication-policy
```

Expected: 建立成功。**必須用 worktree** —— `next-env.d.ts` 會反覆翻動而守則同時禁止 checkout
還原與 gitignore 它,所以主工作樹永遠不是乾淨的,直接跑會每次觸發付費完整重生成。

- [ ] **Step 2: 重生成**

```bash
cd /tmp/openwiki-regen && openwiki code --update --print
```

Expected: 有輸出且 `openwiki/` 底下有差異。**必須帶 `--print`** —— 這是本專案唯一支援的完整命令。

- [ ] **Step 3: 把生成結果帶回分支並 review**

```bash
cd /Users/allen/Dev/blog_Refactoring/myblog-nextjs && cp -R /tmp/openwiki-regen/openwiki/. openwiki/ && git diff --stat openwiki
```

Expected: 有差異。逐一 review,確認描述與本 PR 的行為一致。

- [ ] **Step 4: Commit 並清理 worktree**

```bash
git add openwiki && git commit -m "docs: regenerate OpenWiki for publication policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git worktree remove /tmp/openwiki-regen
```

- [ ] **Step 5: 確認 next-env.d.ts 沒有被誤入庫**

```bash
git log --stat -5 | grep -c "next-env.d.ts" || echo "clean"
```

Expected: `clean`(或 grep 回 0)。若有,用 `git rebase -i` 移除該檔案的變更。

---

## Task 11: 開 PR

- [ ] **Step 1: 推分支**

```bash
git push -u origin feat/post-publication-policy
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "fix: single entrance for post publication policy" --body "$(cat <<'BODY'
修掉 draft 與 hidden 在公開入口的三個洩漏,並把可見性判斷收斂成單一入口。

## 修了什麼

- **hidden 洩漏進公開 pager** —— `data/blog/hidden/` 現有 6 篇全部都在 prev/next 鏈上
- **draft 從 OG endpoint 洩漏** —— `/opengraph-image` 仍回傳含標題的 PNG
- **draft 從 legacy alias 洩漏** —— `/blog/...` 仍 308,洩漏 canonical path
- **draft 進入列表產物** —— `yarn build` 的 contentlayer 步驟沒設 `NODE_ENV`,而兩個 writer 都靠 pliny 的 module-load `isProduction` 判斷

## 怎麼修的

`lib/post-publication.ts` 把 `allBlogs` 投影成 `reachable` 與 `listed` 兩個 view。過濾與排序責任分離(tag key 依 insertion order,而 `app/tag-data.json` 被追蹤)。writers 變成 pure,由 `lib/content-outputs.ts` 餵給它們正確的 view。mode 由呼叫端明確提供,缺省 production。

`collectSeries` 刻意仍收 raw posts —— 它對每一篇都先驗證 series identity,而且 series 永久排除 draft、不看 mode,是獨立的 eligibility domain。

## 驗證

- `yarn test:unit` 全綠(新增 5 支 unit spec)
- `yarn test:parity` 手動跑過全綠(Playwright 不是 CI gate)
- `app/tag-data.json` 在 writer purity 那個 commit 是 **byte 級零變動**
- `yarn check:site-font --full` 通過(fixture 全 ASCII)

## 已知未處理(刻意)

- 首頁 / 年度頁 / archive / tag 頁 / series / sitemap 的**頁面層**過濾仍各自實作,只是現在有共用入口可用。逐一遷移需要 characterization tests,另案。
- `series` 的 eligibility 與 `listed` 語意不同,刻意未統一。

設計文件:`docs/superpowers/specs/2026-07-30-post-publication-policy-design.md`
實作計畫:`docs/superpowers/plans/2026-07-30-post-publication-policy.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: 等必過檢查綠燈**

```bash
gh pr checks --watch
```

Expected: `ci` 與 `check` 兩個都綠。若 PR 卡在 pending,先查 `gh pr view --json mergeStateStatus`
(可能是 `BEHIND`,需要先同步 base)。

---

## Self-Review 結果

**Spec coverage:** spec 的 8 個目標對應:目標 1 → Task 2/3;目標 2 → Task 6 + Task 8 的 pager 測試;
目標 3 → Task 6 + Task 8 的 negative controls;目標 4 → Task 4/5;目標 5(writer purity)→ Task 4;
目標 6(mode 來源)→ Task 5;目標 7(排序決定性)→ Task 2;目標 8(hidden 直達 + preview)→
Task 3 + Task 8 的 positive controls。spec 的突變測試矩陣共 22 條,其中 15 條由 unit 覆蓋
(Task 2/3/4/5/6),7 條由 E2E 覆蓋(Task 8)。

**已知的計畫層限制(刻意,不是遺漏):**

1. **route wiring 用原始碼檢查**,不是執行期斷言。理由:route import `contentlayer/generated`,
   直接 import 會讓 `test:unit` 依賴先跑過 `contentlayer2 build`。沿用 repo 既有的檔案契約寫法
   (`tests/unit/series-rendering.test.ts`)。它能抓到「改回 raw allBlogs」這個我們真正在意的
   突變(正反雙向斷言),但抓不到「呼叫了正確函式卻用錯參數」—— 後者由 Task 8 的 E2E 覆蓋。
2. **Task 4 的測試會覆寫真實產物**(`app/tag-data.json`、`public/search.json`),由 Step 5 的
   `yarn contentlayer2 build` 還原並同時當作零 diff 的驗收。這是刻意的取捨:測 actual output 是
   Codex 指出「只 spy 參數抓不到 writer 內部二次過濾」的唯一辦法。
3. **Task 8 的兩個 pager 路徑常數必須在執行時核對**(計畫中已標註)。它們取決於 `data/blog/` 的
   實際內容,寫死在計畫裡有過期風險。

**Type consistency:** `PublicationMode`、`PublicationPost`、`DatedPost`、`AliasRoutablePost`、
`PostViews<T>`、`ContentOutputDeps<T>`、`LegacyParams` 七個型別在 Task 1/2/3/5 定義,
Task 5/6 使用時名稱與參數順序一致。函式名在 Task 2/3 定義、Task 5/6 使用,已逐一對照:
`resolvePublicationMode`、`selectPostViews`、`sortPostsForNavigation`、
`findReachableByLegacyPath`、`findReachableByAlias`、`resolvePostNeighbors`、
`publishedPostStaticParams`、`runContentDerivedOutputs`。

## PR2 的交接條件

PR2(`headerStyle: text`)**必須以已合併本 PR 的新 main 為 base**,並在那之後才寫它的實作計畫
—— 它會 import 本 PR 建立的 `lib/content-outputs.ts` seam,而且規範明訂 PR2 只能在既有 `deps`
加上 `assertValidHeroConfigurations`,**不得新建那個檔案**。兩條 sibling branch 各自生成
OpenWiki 會衝突。
