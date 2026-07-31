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
