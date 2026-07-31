import { describe, expect, test } from 'vitest'
import { parseHeaderStyle, parseHeroConfiguration } from '../../lib/hero-config'

describe('parseHeaderStyle', () => {
  test('未設視為未啟用', () => {
    expect(parseHeaderStyle(undefined)).toBeNull()
    expect(parseHeaderStyle(null)).toBeNull()
  })

  test('唯一合法字面值', () => {
    expect(parseHeaderStyle('text')).toBe('text')
  })

  // schema 的 enum 不做執行期驗證,這裡是唯一的閘門。
  test('拼錯、大小寫不符、空字串、純空白都必須拋錯', () => {
    expect(() => parseHeaderStyle('txt')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('TEXT')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('')).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle('   ')).toThrow(/headerStyle/)
  })

  test('非字串型別也必須拋錯', () => {
    expect(() => parseHeaderStyle(true)).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle(1)).toThrow(/headerStyle/)
    expect(() => parseHeaderStyle({})).toThrow(/headerStyle/)
  })
})

// 下表逐項複製現況行為。唯一刻意的改變是 headerImg 純空白那一列。
describe('parseHeroConfiguration coercion characterization', () => {
  test('headerImg 純空白視為未設 —— 這是刻意的行為改變', () => {
    // 現況 resolveHeaderImage('  ') 會產生 "/  " 這種壞路徑,沒有理由保留。
    expect(parseHeroConfiguration({ headerImg: '  ' }).headerImg).toBeNull()
  })

  test('headerImg 空字串與未設同義,有值時保留原字串', () => {
    expect(parseHeroConfiguration({ headerImg: '' }).headerImg).toBeNull()
    expect(parseHeroConfiguration({}).headerImg).toBeNull()
    expect(parseHeroConfiguration({ headerImg: '/img/a.jpg' }).headerImg).toBe('/img/a.jpg')
  })

  test('headerBgCss 去頭尾空白並移除尾隨分號', () => {
    expect(parseHeroConfiguration({ headerBgCss: 'linear-gradient(a, b);  ' }).headerBgCss).toBe(
      'linear-gradient(a, b)'
    )
    expect(parseHeroConfiguration({ headerBgCss: '   ' }).headerBgCss).toBeNull()
  })

  test('headerMask: 0 是有效值,不可用 truthy 判斷', () => {
    expect(parseHeroConfiguration({ headerMask: 0 }).headerMask).toBe(0)
  })

  test('Number() 會變成 0 的輸入維持等值(空白字串、false、空陣列)', () => {
    expect(parseHeroConfiguration({ headerMask: ' ' }).headerMask).toBe(0)
    expect(parseHeroConfiguration({ headerMask: false }).headerMask).toBe(0)
    expect(parseHeroConfiguration({ headerMask: [] }).headerMask).toBe(0)
  })

  test('NaN、null、未設、空字串都不渲染遮罩', () => {
    expect(parseHeroConfiguration({ headerMask: {} }).headerMask).toBeNull()
    expect(parseHeroConfiguration({ headerMask: null }).headerMask).toBeNull()
    expect(parseHeroConfiguration({ headerMask: '' }).headerMask).toBeNull()
    expect(parseHeroConfiguration({}).headerMask).toBeNull()
  })

  test('iframe 與 layout 去空白後保留,空值為 null', () => {
    expect(parseHeroConfiguration({ iframe: ' https://slide.allenspace.de/a ' }).iframe).toBe(
      'https://slide.allenspace.de/a'
    )
    expect(parseHeroConfiguration({ iframe: '  ' }).iframe).toBeNull()
    expect(parseHeroConfiguration({ layout: 'PostSimple' }).layout).toBe('PostSimple')
    expect(parseHeroConfiguration({ layout: '' }).layout).toBeNull()
  })

  test('headerStyle 的錯誤會從 parseHeroConfiguration 傳播出來', () => {
    expect(() => parseHeroConfiguration({ headerStyle: 'txt' })).toThrow(/headerStyle/)
    expect(parseHeroConfiguration({ headerStyle: 'text' }).headerStyle).toBe('text')
  })
})
