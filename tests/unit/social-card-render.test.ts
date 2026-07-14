import { createElement } from 'react'
import { ImageResponse } from 'next/og'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import SocialCard from '@/components/social/SocialCard'
import { loadSocialCardFonts } from '@/lib/social-card-font'

describe('SocialCard image rendering', () => {
  it('renders the photo overlay across the generated image', async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: '#c8c8c8',
      },
    })
      .png()
      .toBuffer()
    const background = `data:image/png;base64,${source.toString('base64')}`
    const fonts = await loadSocialCardFonts()
    const response = new ImageResponse(
      createElement(SocialCard, {
        siteName: 'Test Blog',
        title: 'Test',
        summary: '',
        background: { kind: 'image', value: background },
        overlayOpacity: 0.6,
      }),
      { width: 1200, height: 630, fonts }
    )
    const rendered = Buffer.from(await response.arrayBuffer())
    const { data, info } = await sharp(rendered)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const offset = ((info.height - 10) * info.width + info.width - 10) * info.channels

    expect(Array.from(data.subarray(offset, offset + 3))).toEqual([81, 83, 93])
  })
})
