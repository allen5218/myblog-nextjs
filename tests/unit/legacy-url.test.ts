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
