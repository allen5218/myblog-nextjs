import { describe, expect, it } from 'vitest'
import {
  SOCIAL_CARD_FALLBACK,
  postSocialImagePath,
  selectSocialCardBackground,
  selectSocialCardSummary,
} from '@/lib/social-card'

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
      selectSocialCardBackground(
        { headerImg: 'https://img.allenspace.de/post.webp' },
        siteUrl
      )
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
