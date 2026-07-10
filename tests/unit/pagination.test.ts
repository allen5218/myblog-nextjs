import { describe, it, expect } from 'vitest'
import {
  POSTS_PER_PAGE,
  totalPagesFor,
  blogPageHref,
  tagPageHref,
  parseBlogPageSegment,
} from '@/lib/pagination'

// lib/pagination.ts 是「第 n 頁的網址是什麼」的唯一權威。
// 這些測試釘住 Jekyll 原站的分頁語意:首頁本身就是第 1 頁,第 2 頁起才有獨立網址。
// 過去 MAX_DISPLAY 與 POSTS_PER_PAGE 分散在三個檔案各自宣告,
// 導致 / 與 /blog 悄悄變成同一頁而沒有任何程式碼能察覺。

describe('blogPageHref — 首頁即第 1 頁', () => {
  it('第 1 頁就是網站根目錄,不是 /blog/ 也不是 /page1/', () => {
    expect(blogPageHref(1)).toBe('/')
  })

  it('第 2 頁起使用 Jekyll 的 /pageN/ 形式', () => {
    expect(blogPageHref(2)).toBe('/page2/')
    expect(blogPageHref(3)).toBe('/page3/')
    expect(blogPageHref(10)).toBe('/page10/')
  })
})

describe('parseBlogPageSegment — 根層 segment 只認 pageN', () => {
  it('pageN(N>=2)解析成頁碼', () => {
    expect(parseBlogPageSegment('page2')).toBe(2)
    expect(parseBlogPageSegment('page13')).toBe(13)
  })

  it('page1 不是合法網址:第 1 頁只住在 /', () => {
    expect(parseBlogPageSegment('page1')).toBeNull()
  })

  it('年份與其他 segment 一律不是分頁', () => {
    expect(parseBlogPageSegment('2025')).toBeNull()
    expect(parseBlogPageSegment('page')).toBeNull()
    expect(parseBlogPageSegment('page02')).toBeNull()
    expect(parseBlogPageSegment('page2x')).toBeNull()
    expect(parseBlogPageSegment('about')).toBeNull()
  })
})

describe('tagPageHref — 標籤頁的第 1 頁沒有 /page/1/ 分身', () => {
  it('第 1 頁是標籤根目錄', () => {
    expect(tagPageHref('ai', 1)).toBe('/tags/ai/')
  })

  it('第 2 頁起才有 /page/N/', () => {
    expect(tagPageHref('ai', 2)).toBe('/tags/ai/page/2/')
  })
})

describe('totalPagesFor', () => {
  it('依 POSTS_PER_PAGE 換算總頁數', () => {
    expect(POSTS_PER_PAGE).toBe(5)
    expect(totalPagesFor(6)).toBe(2)
    expect(totalPagesFor(5)).toBe(1)
    expect(totalPagesFor(0)).toBe(1)
  })
})
