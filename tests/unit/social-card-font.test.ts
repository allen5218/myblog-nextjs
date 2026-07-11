import { describe, expect, it } from 'vitest'
import { loadSocialCardFonts } from '@/lib/social-card-font'

describe('loadSocialCardFonts', () => {
  it('提供 Chiron Sung HK 的一般與粗體給 ImageResponse', async () => {
    const fonts = await loadSocialCardFonts()

    expect(fonts).toHaveLength(2)
    expect(fonts.map((font) => font.name)).toEqual(['Chiron Sung HK', 'Chiron Sung HK'])
    expect(fonts.map((font) => font.weight)).toEqual([400, 700])
    expect(Array.from(new Uint8Array(fonts[0].data).slice(0, 4))).toEqual([0, 1, 0, 0])
  })
})
