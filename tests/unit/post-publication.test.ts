import { describe, expect, test } from 'vitest'
import {
  findReachableByAlias,
  findReachableByLegacyPath,
  publishedPostStaticParams,
  resolvePostNeighbors,
  resolvePublicationMode,
  selectPostViews,
  sortPostsForNavigation,
  type AliasRoutablePost,
} from '../../lib/post-publication'

const post = (overrides: Record<string, unknown> = {}): AliasRoutablePost =>
  ({
    date: '2026-07-25T00:00:00.000Z',
    legacyPath: '2026/07/25/normal',
    slug: 'normal',
    path: '2026/07/25/normal',
    ...overrides,
  }) as AliasRoutablePost

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

  test('hidden 與 listed 各自獨立排除列表', () => {
    // 測試 hidden 獨立作用:hidden:true 但無 listed 欄位應排除
    const hiddenOnly = post({ legacyPath: '2026/07/25/hidden-only', hidden: true })
    // 測試 listed 獨立作用:listed:false 但無 hidden 欄位應排除
    const listedFalseOnly = post({ legacyPath: '2026/07/25/listed-false-only', listed: false })

    const testPosts = [hiddenOnly, listedFalseOnly, normal]
    const views = selectPostViews(testPosts, 'production')

    // 兩個都應該在 reachable 但都不在 listed
    expect(views.reachable).toEqual([hiddenOnly, listedFalseOnly, normal])
    expect(views.listed).toEqual([normal])
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

describe('finders and neighbours', () => {
  const older = post({
    date: '2021-04-30T00:00:00.000Z',
    legacyPath: '2021/04/30/older',
    slug: 'older',
    path: '2021/04/30/older',
  })
  const hiddenMid = post({
    date: '2025-08-16T00:00:00.000Z',
    legacyPath: '2025/08/16/mid',
    slug: 'mid',
    path: '2025/08/16/mid',
    hidden: true,
    listed: false,
  })
  const newer = post({
    date: '2025-09-23T00:00:00.000Z',
    legacyPath: '2025/09/23/newer',
    slug: 'newer',
    path: '2025/09/23/newer',
  })
  const draft = post({
    date: '2026-07-30T00:00:00.000Z',
    legacyPath: '2026/07/30/draft',
    slug: 'draft',
    path: '2026/07/30/draft',
    draft: true,
  })
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
    expect(resolvePostNeighbors(views, '2025/09/23/newer')).toEqual({
      prev: older,
      next: undefined,
    })
    expect(resolvePostNeighbors(views, '2021/04/30/older')).toEqual({
      prev: undefined,
      next: newer,
    })
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
