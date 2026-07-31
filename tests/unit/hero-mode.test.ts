import { describe, expect, test } from 'vitest'
import { parseHeroConfiguration } from '../../lib/hero-config'
import { resolveHeroSurface } from '../../lib/hero-mode'
import type { RawHeroConfiguration } from '../../lib/hero-config'

const surfaceOf = (raw: RawHeroConfiguration) => resolveHeroSurface(parseHeroConfiguration(raw))

const keynoteSrc = 'https://slide.allenspace.de/deck/'

describe('hero mode priority: keynote > text > css-background > image', () => {
  test('keynote 勝過 text', () => {
    expect(surfaceOf({ iframe: keynoteSrc, headerStyle: 'text' }).mode).toEqual({
      kind: 'keynote',
      iframeSrc: keynoteSrc,
    })
  })

  test('keynote 勝過 headerBgCss 與 headerImg', () => {
    expect(
      surfaceOf({ iframe: keynoteSrc, headerBgCss: 'red', headerImg: '/img/a.jpg' }).mode.kind
    ).toBe('keynote')
  })

  // 執行期順序必須正確,即使 build 已經擋掉這些並存組合。
  test('text 勝過 headerBgCss 與 headerImg', () => {
    expect(surfaceOf({ headerStyle: 'text', headerBgCss: 'red' }).mode).toEqual({ kind: 'text' })
    expect(surfaceOf({ headerStyle: 'text', headerImg: '/img/a.jpg' }).mode).toEqual({
      kind: 'text',
    })
  })

  test('headerBgCss 勝過 headerImg,且尾隨分號已清掉', () => {
    expect(
      surfaceOf({ headerBgCss: 'linear-gradient(a, b);', headerImg: '/img/a.jpg' }).mode
    ).toEqual({ kind: 'css-background', background: 'linear-gradient(a, b)' })
  })

  test('不在允許來源的 iframe 不構成 keynote', () => {
    expect(surfaceOf({ iframe: 'https://example.com/deck' }).mode.kind).toBe('image')
  })
})

describe('image mode fallback colour', () => {
  // 這兩個狀態的 URL 相同、呈現不同:未填 headerImg 時會額外上一層 #2D2D2D 底色,
  // 明填同一 URL 則沿用 class 的 #777。fallbackColor 設成 optional 的話漏填時
  // TypeScript 不會抗議,而症狀(圖片載入前底色改變)在測試裡幾乎看不出來。
  test('未填 headerImg 時用預設圖並帶 #2D2D2D 底色', () => {
    expect(surfaceOf({}).mode).toEqual({
      kind: 'image',
      url: '/img/home-bg.avif',
      fallbackColor: '#2D2D2D',
    })
  })

  test('明填同一個預設 URL 時不帶 fallback 底色', () => {
    expect(surfaceOf({ headerImg: '/img/home-bg.avif' }).mode).toEqual({
      kind: 'image',
      url: '/img/home-bg.avif',
      fallbackColor: null,
    })
  })

  test('相對路徑補上前導斜線,絕對網址原樣保留', () => {
    expect(surfaceOf({ headerImg: 'img/a.jpg' }).mode).toEqual({
      kind: 'image',
      url: '/img/a.jpg',
      fallbackColor: null,
    })
    expect(surfaceOf({ headerImg: 'https://cdn.example.com/a.jpg' }).mode).toEqual({
      kind: 'image',
      url: 'https://cdn.example.com/a.jpg',
      fallbackColor: null,
    })
  })
})

// text 模式強制抑制遮罩(這裡是行為改變的落點);其餘模式維持 commit A 的逐項複製現況。
describe('mask opacity', () => {
  test('有效數字在任何模式都回傳', () => {
    expect(surfaceOf({ headerMask: 0.6 }).maskOpacity).toBe(0.6)
    expect(surfaceOf({ headerMask: 0 }).maskOpacity).toBe(0)
    // keynote 疊加遮罩仍然渲染 —— 證明 text 的抑制是該模式專屬,不是全域行為。
    expect(surfaceOf({ iframe: keynoteSrc, headerMask: 0.6 }).maskOpacity).toBe(0.6)
    expect(surfaceOf({ headerStyle: 'text', headerMask: 0.6 }).maskOpacity).toBeNull()
  })

  test('未設或無法轉成數字時為 null', () => {
    expect(surfaceOf({}).maskOpacity).toBeNull()
    expect(surfaceOf({ headerMask: {} }).maskOpacity).toBeNull()
  })
})
