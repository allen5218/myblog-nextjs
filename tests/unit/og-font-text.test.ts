import { describe, expect, it } from 'vitest'
// 這個 Node ESM 腳本刻意保持為 .mjs，讓 package script 可以直接執行。
import { collectOgFontText } from '../../scripts/og-font-text.mjs'
import { canSkipMissingHarfBuzz } from '../../scripts/og-font-check-policy.mjs'

describe('collectOgFontText', () => {
  it('涵蓋正式／hidden 文章、網站文案與完整英數字', async () => {
    const text = await collectOgFontText(process.cwd())

    expect(text).toContain('學習如何學習')
    expect(text).toContain('C/C++ 代碼顯示測試')
    expect(text).toContain('對世界保持好奇')
    expect(text).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(text).toContain('abcdefghijklmnopqrstuvwxyz')
    expect(text).toContain('0123456789')
  })

  it('排除不屬於 Chiron 字庫的 emoji', async () => {
    const text = await collectOgFontText(process.cwd())

    expect(text).not.toContain('🎞')
  })
})

describe('canSkipMissingHarfBuzz', () => {
  it('只允許 Vercel 建置環境跳過缺少的 hb-shape', () => {
    expect(canSkipMissingHarfBuzz({ VERCEL: '1' })).toBe(true)
    expect(canSkipMissingHarfBuzz({ VERCEL: '0' })).toBe(false)
    expect(canSkipMissingHarfBuzz({ CI: 'true' })).toBe(false)
    expect(canSkipMissingHarfBuzz({})).toBe(false)
  })
})
