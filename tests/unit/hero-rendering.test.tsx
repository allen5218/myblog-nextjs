import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import HuxHero from '../../components/hux/HuxHero'

// 刻意不 import contentlayer 產物:那會讓 test:unit 依賴先跑過 contentlayer2 build,
// 引入測試順序耦合。改用手工建構的 props。
const render = (props: Parameters<typeof HuxHero>[0]) => renderToStaticMarkup(<HuxHero {...props} />)

describe('image hero static rendering', () => {
  test('未填 headerImg 時 inline style 同時帶預設圖與 #2D2D2D 底色', () => {
    const html = render({ title: 'Image Post' })
    expect(html).toContain('/img/home-bg.avif')
    expect(html.toLowerCase()).toContain('#2d2d2d')
  })

  // resolver 回傳正確不代表 renderer 真的用了它,所以 fallbackColor 要在這一層另外斷言。
  test('明填同一個 URL 時 inline style 不含 background-color', () => {
    const html = render({ title: 'Image Post', headerImg: '/img/home-bg.avif' })
    expect(html).toContain('/img/home-bg.avif')
    expect(html.toLowerCase()).not.toContain('background-color')
  })

  test('headerBgCss 的尾隨分號已清掉', () => {
    const html = render({ title: 'Gradient Post', headerBgCss: 'linear-gradient(a, b);' })
    expect(html).toContain('linear-gradient(a, b)')
    expect(html).not.toContain('/img/home-bg.avif')
  })

  test('有效遮罩會渲染 header-mask,含 0', () => {
    expect(render({ title: 'Masked', headerMask: 0.6 })).toContain('header-mask')
    expect(render({ title: 'Masked', headerMask: 0 })).toContain('header-mask')
    expect(render({ title: 'Unmasked' })).not.toContain('header-mask')
  })

  test('keynote 渲染 iframe 並保留 intro-header-keynote', () => {
    const html = render({ title: 'Deck', iframe: 'https://slide.allenspace.de/deck/' })
    expect(html).toContain('intro-header-keynote')
    expect(html).toContain('keynote-frame')
  })

  // keynote 底下不該有任何東西畫背景色,標題內容也要被 sr-only 蓋掉(視覺上由 iframe 取代)。
  test('keynote 完全沒有 inline style,內容包裝用 sr-only', () => {
    const html = render({ title: 'Deck', iframe: 'https://slide.allenspace.de/deck/' })
    expect(html).toContain('sr-only')
    expect(html).not.toContain('style=')
  })

  test('自訂 headerImg 會渲染出該 URL,而不是預設圖', () => {
    const html = render({ title: 'Custom Image Post', headerImg: '/img/custom-hero.jpg' })
    expect(html).toContain('/img/custom-hero.jpg')
    expect(html).not.toContain('home-bg')
  })
})

describe('text hero static rendering', () => {
  test('帶 intro-header-text、完全沒有 style 屬性', () => {
    const html = render({ title: 'Text Post', headerStyle: 'text' })
    expect(html).toContain('intro-header-text')
    // inline style 贏過任何 class 規則,純 CSS 蓋不掉 backgroundImage 的 fallback,
    // 所以 text 模式必須讓元件根本不產生 style 屬性。
    expect(html).not.toContain('style=')
  })

  // ⚠️ 這裡**刻意不斷言** text + headerMask 沒有遮罩。commit A 是等值重構,遮罩行為
  // 逐項複製現況(不分模式),所以此時 text + mask **仍然會**渲染遮罩。抑制遮罩是行為
  // 改變,連同它的斷言一起放在 Task 8。在這裡寫 not.toContain('header-mask') 會讓
  // commit A 不可能全綠。

  test('圖片模式仍然帶 inline style —— 證明上一條有鑑別力', () => {
    expect(render({ title: 'Image Post' })).toContain('style=')
  })

  test('text 模式仍然渲染標題、副標、tags 與 metadata', () => {
    const html = render({
      title: 'Text Post',
      subtitle: 'Sub',
      tags: ['alpha'],
      author: 'Allen',
      date: '2026-07-31',
      headerStyle: 'text',
    })
    expect(html).toContain('Text Post')
    expect(html).toContain('Sub')
    expect(html).toContain('alpha')
    expect(html).toContain('Posted by Allen')
  })
})

describe('text hero suppresses the mask', () => {
  test('即使明確給了 headerMask 也不渲染遮罩', () => {
    expect(render({ title: 'T', headerStyle: 'text', headerMask: 0.6 })).not.toContain(
      'header-mask'
    )
  })

  test('keynote 仍然渲染遮罩 —— 證明抑制是 text 專屬的', () => {
    const html = render({
      title: 'Deck',
      iframe: 'https://slide.allenspace.de/deck/',
      headerMask: 0.6,
    })
    expect(html).toContain('header-mask')
  })
})
