import { describe, expect, test } from 'vitest'
import {
  parseHeaderStyle,
  parseHeroConfiguration,
  validateHeroConfiguration,
  assertValidHeroConfigurations,
} from '../../lib/hero-config'

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

describe('validateHeroConfiguration', () => {
  const validate = (raw: Record<string, unknown>) =>
    validateHeroConfiguration(raw, 'blog/example.md')

  test('沒有 headerStyle 時什麼都不擋', () => {
    expect(() => validate({ headerImg: '/img/a.jpg', headerMask: 0.6 })).not.toThrow()
    expect(() => validate({ iframe: 'https://slide.allenspace.de/a' })).not.toThrow()
  })

  test('text 單獨使用是合法的', () => {
    expect(() => validate({ headerStyle: 'text' })).not.toThrow()
  })

  test.each([
    ['headerImg', { headerImg: '/img/a.jpg' }],
    ['headerBgCss', { headerBgCss: 'linear-gradient(a, b)' }],
    ['iframe', { iframe: 'https://slide.allenspace.de/a' }],
  ])('text 併用 %s 必須失敗,並指出檔名與衝突欄位', (field, extra) => {
    expect(() => validate({ headerStyle: 'text', ...extra })).toThrow(
      new RegExp(`blog/example\\.md[\\s\\S]*${field}`)
    )
  })

  // headerMask: 0 是有效值,truthy 判斷會漏掉它。
  test('text 併用 headerMask 必須失敗,含 headerMask: 0', () => {
    expect(() => validate({ headerStyle: 'text', headerMask: 0.6 })).toThrow(/headerMask/)
    expect(() => validate({ headerStyle: 'text', headerMask: 0 })).toThrow(/headerMask/)
  })

  test.each(['PostSimple', 'PostBanner'])('text 併用 layout %s 必須失敗', (layout) => {
    expect(() => validate({ headerStyle: 'text', layout })).toThrow(/layout/)
  })

  test('text 併用預設 layout 是合法的', () => {
    expect(() => validate({ headerStyle: 'text', layout: 'post' })).not.toThrow()
    expect(() => validate({ headerStyle: 'text' })).not.toThrow()
  })

  test('一次列出所有衝突欄位,不是只報第一個', () => {
    const message = (() => {
      try {
        validate({ headerStyle: 'text', headerImg: '/a.jpg', headerMask: 0 })
        return ''
      } catch (error) {
        return (error as Error).message
      }
    })()
    expect(message).toContain('headerImg')
    expect(message).toContain('headerMask')
  })
})

describe('assertValidHeroConfigurations', () => {
  test('對每一篇都驗證,錯誤訊息帶得出是哪一篇', () => {
    expect(() =>
      assertValidHeroConfigurations([
        { _raw: { sourceFilePath: 'blog/ok.md' }, headerStyle: 'text' },
        { _raw: { sourceFilePath: 'blog/bad.md' }, headerStyle: 'text', headerImg: '/a.jpg' },
      ])
    ).toThrow(/blog\/bad\.md/)
  })

  test('全部合法時不拋錯', () => {
    expect(() =>
      assertValidHeroConfigurations([
        { _raw: { sourceFilePath: 'blog/ok.md' }, headerImg: '/a.jpg' },
      ])
    ).not.toThrow()
  })
})
