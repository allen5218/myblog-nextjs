import { describe, it, expect } from 'vitest'
import { isResponsiveIframeSrc, resolveHeroIframeSrc } from '@/lib/iframe'

// lib/iframe.ts 是判斷「哪些外部 iframe 來源可信」的安全邊界。
// 這些測試把允許/拒絕的規則固定下來,特別是各種繞過白名單的嘗試。

describe('isResponsiveIframeSrc — 影音供應商允許子網域', () => {
  it('沒有 src 或空字串時回傳 false', () => {
    expect(isResponsiveIframeSrc()).toBe(false)
    expect(isResponsiveIframeSrc('')).toBe(false)
    expect(isResponsiveIframeSrc(undefined)).toBe(false)
  })

  it('允許 YouTube 主機與其子網域', () => {
    expect(isResponsiveIframeSrc('https://youtube.com/watch?v=abc')).toBe(true)
    expect(isResponsiveIframeSrc('https://www.youtube.com/embed/abc')).toBe(true)
    expect(isResponsiveIframeSrc('https://m.youtube.com/watch?v=abc')).toBe(true)
  })

  it('允許 youtube-nocookie / youtu.be / vimeo(含子網域)', () => {
    expect(isResponsiveIframeSrc('https://www.youtube-nocookie.com/embed/abc')).toBe(true)
    expect(isResponsiveIframeSrc('https://youtube-nocookie.com/embed/abc')).toBe(true)
    expect(isResponsiveIframeSrc('https://youtu.be/abc')).toBe(true)
    expect(isResponsiveIframeSrc('https://vimeo.com/12345')).toBe(true)
    expect(isResponsiveIframeSrc('https://player.vimeo.com/video/12345')).toBe(true)
  })

  it('主機名比對不分大小寫', () => {
    expect(isResponsiveIframeSrc('https://WWW.YOUTUBE.COM/embed/abc')).toBe(true)
  })

  it('接受協定相對 URL(//host)並補上 https', () => {
    expect(isResponsiveIframeSrc('//www.youtube.com/embed/abc')).toBe(true)
  })

  describe('拒絕繞過白名單的嘗試', () => {
    it('相似但不同的網域(前綴接在允許網域上)', () => {
      // endsWith("youtube.com") 為真,但不是 ".youtube.com",必須擋下
      expect(isResponsiveIframeSrc('https://evil-youtube.com/embed/abc')).toBe(false)
      expect(isResponsiveIframeSrc('https://notyoutube.com/embed/abc')).toBe(false)
      expect(isResponsiveIframeSrc('https://fakeyoutu.be/abc')).toBe(false)
    })

    it('把允許網域放在攻擊者網域的子網域', () => {
      expect(isResponsiveIframeSrc('https://youtube.com.evil.com/embed/abc')).toBe(false)
      expect(isResponsiveIframeSrc('https://vimeo.com.attacker.net/12345')).toBe(false)
    })

    it('完全不相關的網域', () => {
      expect(isResponsiveIframeSrc('https://example.com/embed/abc')).toBe(false)
    })

    it('無效或非 http 的 URL', () => {
      expect(isResponsiveIframeSrc('not a url')).toBe(false)
      // mailto 沒有 hostname
      expect(isResponsiveIframeSrc('mailto:someone@youtube.com')).toBe(false)
    })
  })
})

describe('resolveHeroIframeSrc — hero 投影片用 origin 完全比對', () => {
  it('沒有 src 時回傳 undefined', () => {
    expect(resolveHeroIframeSrc()).toBeUndefined()
    expect(resolveHeroIframeSrc('')).toBeUndefined()
  })

  it('允許的 origin 回傳完整 href', () => {
    expect(resolveHeroIframeSrc('https://slide.allenspace.de/deck/1')).toBe(
      'https://slide.allenspace.de/deck/1'
    )
    // 只有 origin、沒有路徑時,URL 會正規化補上結尾斜線
    expect(resolveHeroIframeSrc('https://slide.allenspace.de')).toBe('https://slide.allenspace.de/')
  })

  it('接受協定相對 URL 並補上 https', () => {
    expect(resolveHeroIframeSrc('//slide.allenspace.de/deck/1')).toBe(
      'https://slide.allenspace.de/deck/1'
    )
  })

  describe('拒絕 origin 不完全相符的來源', () => {
    it('http(非 https)要擋下', () => {
      expect(resolveHeroIframeSrc('http://slide.allenspace.de/deck/1')).toBeUndefined()
    })

    it('子網域或不同主機要擋下', () => {
      expect(resolveHeroIframeSrc('https://evil.slide.allenspace.de/deck/1')).toBeUndefined()
      expect(resolveHeroIframeSrc('https://slide.allenspace.de.evil.com/deck/1')).toBeUndefined()
      expect(resolveHeroIframeSrc('https://allenspace.de/deck/1')).toBeUndefined()
    })

    it('加上非預設 port 要擋下', () => {
      expect(resolveHeroIframeSrc('https://slide.allenspace.de:8443/deck/1')).toBeUndefined()
    })

    it('無效 URL 回傳 undefined', () => {
      expect(resolveHeroIframeSrc('not a url')).toBeUndefined()
    })
  })
})
