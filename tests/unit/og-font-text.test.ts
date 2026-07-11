import { describe, expect, it } from 'vitest'
// 這個 Node ESM 腳本刻意保持為 .mjs，讓 package script 可以直接執行。
import { collectOgFontText } from '../../scripts/og-font-text.mjs'

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
