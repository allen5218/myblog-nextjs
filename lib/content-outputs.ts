import { selectPostViews, type PublicationMode, type PublicationPost } from './post-publication'

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
