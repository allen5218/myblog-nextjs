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
