// 分頁網址的唯一權威。對齊 jekyll-paginate 的語意:首頁本身就是第 1 頁,
// 第 2 頁起才有獨立網址 /pageN/。任何「第 n 頁在哪」的問題都只能問這裡,
// 不要在頁面元件裡拼字串 —— 那正是 / 與 /blog 曾經變成同一頁的原因。
export const POSTS_PER_PAGE = 5

// 沒有文章時仍視為 1 頁,讓列表頁顯示空狀態而不是 404。
export function totalPagesFor(postCount: number): number {
  return Math.max(1, Math.ceil(postCount / POSTS_PER_PAGE))
}

export function blogPageHref(page: number): string {
  return page === 1 ? '/' : `/page${page}/`
}

export function tagPageHref(tag: string, page: number): string {
  return page === 1 ? `/tags/${tag}/` : `/tags/${tag}/page/${page}/`
}

// 根層 segment 與文章網址的 [year] 共用同一個 dynamic slot,
// 所以這裡要嚴格:只有 page2、page3…算分頁。page1 不合法(第 1 頁住在 /),
// 前導零與其他雜訊一律拒絕,避免生出等價網址。
export function parseBlogPageSegment(segment: string): number | null {
  const match = /^page([1-9]\d*)$/.exec(segment)
  if (!match) return null

  const page = Number(match[1])
  return page >= 2 ? page : null
}
