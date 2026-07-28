import { describe, expect, test } from 'vitest'
import {
  collectSeries,
  findSeriesBySlug,
  latestSeriesLastModified,
  seriesHref,
  seriesIdentity,
  seriesSlug,
} from '../../lib/series'

const post = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-07-25T00:00:00.000Z',
  path: '2026/07/25/openwiki-tame-agents-md',
  title: 'OpenWiki',
  ...overrides,
})

describe('series domain', () => {
  test('creates the canonical Chinese series slug and href', () => {
    expect(seriesSlug('AI 自維護的知識庫')).toBe('ai-自維護的知識庫')
    expect(seriesHref('AI 自維護的知識庫')).toBe('/series/ai-自維護的知識庫/')
  })

  test('excludes hidden, draft, blank, and missing series posts', () => {
    const groups = collectSeries([
      post({ series: 'AI 自維護的知識庫' }),
      post({ path: 'hidden', series: 'AI 自維護的知識庫', listed: false }),
      post({ path: 'draft', series: 'AI 自維護的知識庫', draft: true }),
      post({ path: 'blank', series: '   ' }),
      post({ path: 'none' }),
    ])
    expect(groups.map(({ name, posts }) => [name, posts.map(({ path }) => path)])).toEqual([
      ['AI 自維護的知識庫', ['2026/07/25/openwiki-tame-agents-md']],
    ])
  })

  test('rejects nonblank series names that normalize to an empty slug', () => {
    expect(seriesIdentity('   ')).toBeUndefined()
    expect(seriesIdentity('!!!')).toBeUndefined()
    expect(seriesIdentity('😀')).toBeUndefined()
    expect(() => collectSeries([post({ series: '!!!' })])).toThrow(/series name.*non-empty slug/i)
    expect(() => seriesHref('😀')).toThrow(/series name.*non-empty slug/i)
  })

  test('orders series posts oldest first and breaks date ties by path', () => {
    const [group] = collectSeries([
      post({ date: '2026-07-26T00:00:00.000Z', path: 'third', series: 'S' }),
      post({ date: '2026-07-25T00:00:00.000Z', path: 'second', series: 'S' }),
      post({ date: '2026-07-25T00:00:00.000Z', path: 'first', series: 'S' }),
    ])
    expect(group.posts.map(({ path }) => path)).toEqual(['first', 'second', 'third'])
  })

  test('breaks date ties by a locale-independent Unicode path order', () => {
    const [group] = collectSeries([
      post({ path: '中', series: 'S' }),
      post({ path: 'ä', series: 'S' }),
      post({ path: 'z', series: 'S' }),
      post({ path: 'a', series: 'S' }),
    ])
    expect(group.posts.map(({ path }) => path)).toEqual(['a', 'z', 'ä', '中'])
  })

  test('uses the latest member lastmod instead of the final reading-order post', () => {
    expect(
      latestSeriesLastModified([
        post({ date: '2026-01-01', lastmod: '2026-12-01' }),
        post({ date: '2026-07-01', lastmod: '2026-07-02' }),
      ])
    ).toBe('2026-12-01')
  })

  test('finds encoded or decoded route slugs', () => {
    const posts = [post({ series: 'AI 自維護的知識庫' })]
    expect(findSeriesBySlug(posts, 'ai-自維護的知識庫')?.name).toBe('AI 自維護的知識庫')
    expect(findSeriesBySlug(posts, encodeURI('ai-自維護的知識庫'))?.name).toBe('AI 自維護的知識庫')
  })

  test('rejects different names that collapse to one slug', () => {
    expect(() =>
      collectSeries([
        post({ path: 'one', series: 'Hello World' }),
        post({ path: 'two', series: 'hello-world' }),
      ])
    ).toThrow(/series slug collision.*hello-world/i)
  })
})
