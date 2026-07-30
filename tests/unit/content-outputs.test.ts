import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { runContentDerivedOutputs } from '../../lib/content-outputs'
import type { PublicationPost } from '../../lib/post-publication'

// 明確標註回傳型別與 PublicationPost 交叉,滿足 TypeScript 的 weak type 檢查
// (PublicationPost 全部欄位都是 optional,單靠推論會被判定為零重疊而拒絕)。
type PostFixture = PublicationPost & {
  date: string
  legacyPath: string
  title: string
}

const post = (overrides: Record<string, unknown> = {}): PostFixture =>
  ({
    date: '2026-07-25T00:00:00.000Z',
    legacyPath: '2026/07/25/normal',
    title: 'Normal',
    ...overrides,
  }) as PostFixture

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
