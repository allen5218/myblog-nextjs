import { describe, expect, it } from 'vitest'
import {
  SOCIAL_CARD_FALLBACK,
  normalizeSocialCardBackgroundForImageResponse,
  pageSocialImagePath,
  postSocialImagePath,
  selectSocialCardOverlayOpacity,
  selectSocialCardBackground,
  selectSocialCardSummary,
} from '@/lib/social-card'
import sharp from 'sharp'

const siteUrl = 'https://blog.allenspace.de'

describe('selectSocialCardBackground', () => {
  it('headerImg 優先於 headerBgCss，並把站內路徑轉成絕對網址', () => {
    expect(
      selectSocialCardBackground(
        {
          headerImg: '/img/post.jpg',
          headerBgCss: 'linear-gradient(red, blue)',
        },
        siteUrl
      )
    ).toEqual({
      kind: 'image',
      value: 'https://blog.allenspace.de/img/post.jpg',
    })
  })

  it('保留遠端 headerImg 網址', () => {
    expect(
      selectSocialCardBackground({ headerImg: 'https://img.allenspace.de/post.webp' }, siteUrl)
    ).toEqual({
      kind: 'image',
      value: 'https://img.allenspace.de/post.webp',
    })
  })

  it('沒有圖片時清理並使用 linear-gradient', () => {
    expect(
      selectSocialCardBackground(
        { headerBgCss: ' linear-gradient(to right, #5d4e6d, #4a5568); ' },
        siteUrl
      )
    ).toEqual({
      kind: 'gradient',
      value: 'linear-gradient(to right, #5d4e6d, #4a5568)',
    })
  })

  it('不支援的 CSS 與空值回退到品牌背景', () => {
    expect(
      selectSocialCardBackground({ headerBgCss: 'url(javascript:alert(1))' }, siteUrl)
    ).toEqual({ kind: 'fallback', value: SOCIAL_CARD_FALLBACK })
    expect(selectSocialCardBackground({}, siteUrl)).toEqual({
      kind: 'fallback',
      value: SOCIAL_CARD_FALLBACK,
    })
  })
})

describe('selectSocialCardOverlayOpacity', () => {
  it('有 headerImg 與 headerMask 時沿用文章遮罩強度', () => {
    expect(selectSocialCardOverlayOpacity({ kind: 'image', value: '/img/post.jpg' }, 0.7)).toBe(0.7)
  })

  it('未設定 headerMask 時維持原本的照片與漸層遮罩', () => {
    expect(selectSocialCardOverlayOpacity({ kind: 'image', value: '/img/post.jpg' })).toBe(0.58)
    expect(
      selectSocialCardOverlayOpacity({ kind: 'gradient', value: 'linear-gradient(red, blue)' }, 0.7)
    ).toBe(0.16)
  })
})

describe('normalizeSocialCardBackgroundForImageResponse', () => {
  it('把 ImageResponse 不支援的 WebP 背景轉成 PNG data URL', async () => {
    const webp = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#5d4e6d',
      },
    })
      .webp()
      .toBuffer()
    const fetcher = async () =>
      new Response(new Uint8Array(webp), { headers: { 'content-type': 'image/webp' } })

    const result = await normalizeSocialCardBackgroundForImageResponse(
      { kind: 'image', value: 'https://img.allenspace.de/post.webp' },
      fetcher
    )

    expect(result.kind).toBe('image')
    expect(result.value).toMatch(/^data:image\/png;base64,/)
  })

  it('圖片抓取失敗時回退品牌背景', async () => {
    const fetcher = async () => new Response('missing', { status: 404 })

    const result = await normalizeSocialCardBackgroundForImageResponse(
      { kind: 'image', value: 'https://img.allenspace.de/missing.webp' },
      fetcher
    )

    expect(result.kind).toBe('gradient-image')
    expect(result.value).toMatch(/^data:image\/png;base64,/)
  })

  it('把合法 linear-gradient 轉成保留色彩的 PNG 圖片', async () => {
    const result = await normalizeSocialCardBackgroundForImageResponse({
      kind: 'gradient',
      value: 'linear-gradient(to right, #5d4e6d, #4a5568)',
    })

    expect(result.kind).toBe('gradient-image')
    expect(result.value).toMatch(/^data:image\/png;base64,/)
    const png = Buffer.from(result.value.split(',')[1], 'base64')
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(data[2] - data[1]).toBeGreaterThan(8)
  })
})

describe('selectSocialCardSummary', () => {
  it('優先使用 subtitle，缺少時才使用 preview', () => {
    expect(selectSocialCardSummary('Subtitle', 'Preview')).toBe('Subtitle')
    expect(selectSocialCardSummary('', 'Preview')).toBe('Preview')
    expect(selectSocialCardSummary('  ', '  ')).toBe('')
  })
})

describe('postSocialImagePath', () => {
  it('產生 dated post 的穩定圖片端點', () => {
    expect(postSocialImagePath('2026/04/26/learning-how-to-learn')).toBe(
      '/2026/04/26/learning-how-to-learn/opengraph-image'
    )
    expect(postSocialImagePath('/2026/04/26/learning-how-to-learn/')).toBe(
      '/2026/04/26/learning-how-to-learn/opengraph-image'
    )
  })
})

describe('pageSocialImagePath', () => {
  it('把一般頁面的標題與摘要安全編碼進品牌 OG 圖網址', () => {
    expect(pageSocialImagePath('Page 2', 'Allen & friends')).toBe(
      '/social-card?title=Page+2&summary=Allen+%26+friends'
    )
    expect(pageSocialImagePath('Page 1234567890', 'Pagination')).toContain('title=Page+1234567890')
  })
})
