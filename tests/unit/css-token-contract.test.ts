import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, type ButtonHTMLAttributes, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AtRule, Rule, parse, type Container, type Document } from 'postcss'
import { describe, expect, test, vi } from 'vitest'
import MobileNavMenu from '@/components/MobileNavMenu'
import SearchButton from '@/components/SearchButton'
import ThemeSwitch from '@/components/ThemeSwitch'

// PR #68 把 hero 與導覽列的顏色收進 custom property,唯一的 oracle 是 Playwright,
// 而 Playwright 不是必過檢查 —— 刪掉一個 token 宣告或把消費者改回寫死值,ci 與 check
// 都是綠的。這支測試把「接線」放進 test:unit(在必過的 ci job 裡)。
//
// 它刻意只守接線,不守外觀。守不到的東西明列如下,不要以為有了這支就夠:
//   - 算出來的顏色與對比度(把 --navbar-fg: var(--hux-text) 直接改成 #fff,接線完好,全綠)
//   - 斷點覆蓋(媒體查詢之間的空隙)
//   - 另立一條權重更高的新規則來蓋掉 token(見 consumedBy 的註解)
// 這三類仍然只有 tests/playwright/header-style-text.spec.ts 抓得到。

// pliny 的搜尋按鈕在 vitest 裡 import 就會失敗:它拉進 @docsearch/react,那是 CJS 模組,
// 具名匯出 useDocSearchKeyboardEvents 解不出來。這是載入失敗不是渲染失敗,try/catch 救不了。
// 換成把第三方外殼換掉,保留我們自己的 SearchButton 受測 —— 斷言的是「我們把語意 class
// 交給了它渲染的按鈕」。pliny 之後若不再轉發 className,這支測試看不出來;那條由
// Playwright 的實測負責。
//
// 兩個 factory 內容相同卻不能抽成共用函式:vi.mock 會被 hoist 到檔案最上面,引用任何頂層
// 變數都是 ReferenceError。型別匯入會被抹除,所以只有型別可以從上面借。
vi.mock('pliny/search/AlgoliaButton', async () => {
  const { createElement: create } = await import('react')
  const AlgoliaButton: FunctionComponent<ButtonHTMLAttributes<HTMLButtonElement>> = (props) =>
    create('button', props)
  return { AlgoliaButton }
})
vi.mock('pliny/search/KBarButton', async () => {
  const { createElement: create } = await import('react')
  const KBarButton: FunctionComponent<ButtonHTMLAttributes<HTMLButtonElement>> = (props) =>
    create('button', props)
  return { KBarButton }
})

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), 'utf8')

const stylesheet = parse(readSource('css', 'tailwind.css'))

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ')

/**
 * 把一條規則壓成穩定的字串座標。
 *
 * @media 條件必須入座標:`.navbar-custom.is-fixed` 在 min-width:768px 內外是兩個不同的
 * 宣告點,少了前綴就會塌成同一個 key。祖先 rule 的選擇器同理 —— 這份樣式表用了 CSS 巢狀
 * (`@layer utilities` 裡的 `& a`),不帶祖先的話 .prose 與 .prose-invert 底下的同名巢狀
 * 規則會共用座標,刪掉其中一個就看不出來。
 *
 * 座標仍不保證唯一(同一個選擇器可以在檔案裡出現兩次,`.side-catalog` 今天就是),
 * 所以下面兩個函式都刻意「不去重」——重複的宣告點會重複出現在陣列裡,少一個就會短一截。
 */
function scopeOf(rule: Rule): string {
  const ancestors: string[] = []
  let node: Container | Document | undefined = rule.parent
  while (node) {
    if (node instanceof AtRule) ancestors.unshift(`@${node.name} ${node.params}`)
    else if (node instanceof Rule) ancestors.unshift(collapseWhitespace(node.selector))
    node = node.parent
  }
  return [...ancestors, collapseWhitespace(rule.selector)].join(' | ')
}

/**
 * 宣告 token 的 scope,已排序、未去重。
 *
 * 盲點:只看 rule 底下的宣告。Tailwind v4 的 `@theme` 區塊(本檔案裡有 30 條宣告)其父節點
 * 是 at-rule,不會被看見。今天沒有任何受保護的 token 住在那裡;哪天有 token 搬進 @theme,
 * 這裡會少算而讓對應的 golden 變紅(fail-loud),但新加在 @theme 的 token 是守不到的。
 */
function declaredIn(token: string): string[] {
  const scopes: string[] = []
  stylesheet.walkRules((rule) => {
    for (const node of rule.nodes) {
      if (node.type === 'decl' && node.prop === token) scopes.push(scopeOf(rule))
    }
  })
  return scopes.sort()
}

/**
 * 讀 token 的 `scope :: 屬性`,已排序、未去重。屬性入座標,才分得出同一條規則裡的不同用途。
 *
 * 同一條規則裡只採「最後一次」宣告,因為 CSS 就是後者勝出:在 `color: var(--navbar-fg)`
 * 後面補一行 `color: #fff` 會讓 token 完全失效,但前一行還在 —— 只看「有沒有出現 var()」
 * 的話這種覆蓋是隱形的,而 yarn lint 不含 css/,沒有別的關卡會擋。
 *
 * 仍然守不到的:另立一條權重更高的新規則(例如 `.intro-header-text .tags .tag { ... }`)
 * 來蓋掉這一條。那需要做層疊求解,不是 AST 掃描能回答的問題。
 */
function consumedBy(token: string): string[] {
  // 允許 fallback 與空白(`var(--x, #fff)`、`var( --x )`)——那些都是合法的消費形式,
  // 不該誤紅。結尾限定 , 或 ) 才不會讓 --navbar-fg 誤配到 --navbar-fg-hover。
  const reference = new RegExp(`var\\(\\s*${token}\\s*[,)]`)
  const sites: string[] = []
  stylesheet.walkRules((rule) => {
    const winningValue = new Map<string, string>()
    for (const node of rule.nodes) {
      if (node.type === 'decl') winningValue.set(node.prop, node.value)
    }
    for (const [prop, value] of winningValue) {
      if (reference.test(value)) sites.push(`${scopeOf(rule)} :: ${prop}`)
    }
  })
  return sites.sort()
}

/**
 * 讀出 token 的最後宣告座標和值；@theme 不是 Rule,所以也必須保留它的 at-rule scope。
 */
function declaredValues(token: string): string[] {
  const declarations: string[] = []
  stylesheet.walkDecls(token, (declaration) => {
    const parent = declaration.parent
    if (parent instanceof Rule) declarations.push(`${scopeOf(parent)} :: ${declaration.value}`)
    else if (parent instanceof AtRule) declarations.push(`@${parent.name} ${parent.params} :: ${declaration.value}`)
  })
  return declarations.sort()
}

const NAVBAR_TOKEN_SCOPES = [
  '.navbar-custom',
  '@media (max-width: 767.98px) | body:has(main .intro-header-post.intro-header-text) .navbar-custom',
  '@media (min-width: 768px) | .dark .navbar-custom.is-fixed',
  '@media (min-width: 768px) | .navbar-custom.is-fixed',
  'body:has(main .intro-header-post.intro-header-text) .navbar-custom:not(.is-fixed)',
].sort()

const HERO_TOKENS = ['--hero-fg', '--hero-border', '--hero-link-hover']
const HERO_TOKEN_SCOPES = ['.intro-header', '.intro-header-text'].sort()

describe('navbar colour tokens', () => {
  // 兩邊都各自釘死 golden,而不是只釘一邊再比對:只比對的話,同時從某個 scope 刪掉兩個
  // token 會讓它保持相等而全綠,得靠另一條測試補刀。
  // 逐字比對而非只比數量,是為了把 767.98px 釘住:它與 min-width:768px 首尾相接,寫成
  // 767px 會留下一段兩條媒體查詢都不吃的小數 viewport,--navbar-fg 退回 #fff。
  test('--navbar-fg 的宣告點就是這五處', () => {
    expect(declaredIn('--navbar-fg')).toEqual(NAVBAR_TOKEN_SCOPES)
  })

  test('--navbar-fg-hover 的宣告點就是同樣那五處', () => {
    expect(declaredIn('--navbar-fg-hover')).toEqual(NAVBAR_TOKEN_SCOPES)
  })

  // 單獨少一個 hover token,該情境就會退回 .navbar-custom 基底的 rgba(255,255,255,.8),
  // 在淺色頁面上是白對白。這條把「兩者必須成對出現」講成不變量,而不只是兩份 golden 的巧合。
  test('兩個導覽列 token 永遠成對宣告', () => {
    expect(declaredIn('--navbar-fg-hover')).toEqual(declaredIn('--navbar-fg'))
  })

  test('--navbar-fg 的消費者就是這四處', () => {
    expect(consumedBy('--navbar-fg')).toEqual(
      [
        '.icon-bar :: background',
        '.navbar-brand :: color',
        '.navbar-custom :: color',
        '.navbar-links a, .navbar-tool-trigger :: color',
      ].sort()
    )
  })

  test('--navbar-fg-hover 的消費者就是 brand 與 links 的 hover', () => {
    expect(consumedBy('--navbar-fg-hover')).toEqual([
      '.navbar-brand:hover, .navbar-links a:hover :: color',
    ])
  })
})

describe('hero colour tokens', () => {
  // 完整性:一個模式只改三個裡的一個,另外兩個會靜默沿用深色照片的值。
  test.each(HERO_TOKEN_SCOPES)('%s 同時宣告全部三個 hero token', (scope) => {
    expect(HERO_TOKENS.filter((token) => declaredIn(token).includes(scope)).sort()).toEqual(
      [...HERO_TOKENS].sort()
    )
  })

  test('三個 hero token 的宣告點都只有這兩處', () => {
    for (const token of HERO_TOKENS) {
      expect(declaredIn(token)).toEqual(HERO_TOKEN_SCOPES)
    }
  })

  test('--hero-fg 的消費者就是這兩處', () => {
    expect(consumedBy('--hero-fg')).toEqual(
      ['.intro-header :: color', '.post-heading .meta, .post-heading .series-meta :: color'].sort()
    )
  })

  // 這條規則在 PR #68 的第三輪 review 被指出完全沒有 oracle:刪掉它,淺色 text hero 的
  // 標籤會是白框對白底,看不見,而所有測試照樣綠。
  test('--hero-border 的唯一消費者是 hero 標籤邊框', () => {
    expect(consumedBy('--hero-border')).toEqual(['.intro-header .tags .tag :: border-color'])
  })

  test('--hero-link-hover 的唯一消費者是 hero series 連結的 hover 與 focus', () => {
    expect(consumedBy('--hero-link-hover')).toEqual([
      '.intro-header-post .series-meta a:hover, .intro-header-post .series-meta a:focus :: color',
    ])
  })
})

describe('paired interactive tokens', () => {
  // --hux-interactive 隨主題翻轉,所以它不能同時當「頁面底色上的前景」和「承載文字的
  // focus 背景」;白字對它的深色值只有 1.94。成對 token 存在的唯一理由就是這個。
  test('--hux-interactive 與 --hux-on-interactive 都在 :root 與 .dark 宣告', () => {
    expect(declaredIn('--hux-interactive')).toEqual(['.dark', ':root'])
    expect(declaredIn('--hux-on-interactive')).toEqual(['.dark', ':root'])
  })

  // --hux-on-interactive 在整份 CSS 裡沒有消費者 —— 它只被元件的 Tailwind arbitrary
  // utility 讀取,所以它的保護在下面的原始碼契約,不在這一層。不要在這裡加「每個 token
  // 至少要有一個 CSS 消費者」的通則,那條通則對這個 token 會直接誤紅。
  test('--hux-interactive 的消費者就是這五處', () => {
    expect(consumedBy('--hux-interactive')).toEqual(
      [
        ':root :: --series-interactive',
        '.dark :: --series-interactive',
        'body:has(main .intro-header-post.intro-header-text) .navbar-custom:not(.is-fixed) :: --navbar-fg-hover',
        '@media (max-width: 767.98px) | body:has(main .intro-header-post.intro-header-text) .navbar-custom :: --navbar-fg-hover',
        '.intro-header-text :: --hero-link-hover',
      ].sort()
    )
  })
})

describe('scoped control accent', () => {
  test('--hux-control-accent only declares the fixed requested value', () => {
    expect(declaredValues('--hux-control-accent')).toEqual([':root :: #3a839e'])
  })

  test('--hux-control-accent has only the requested effective CSS consumers', () => {
    expect(consumedBy('--hux-control-accent')).toEqual([
      '#kbar-listbox .text-primary-600 :: color',
      "#kbar-listbox [role='option'][aria-selected='true'] > div > .cursor-pointer, #kbar-listbox [role='option']:hover > div > .cursor-pointer :: background-color",
      '.hux-elevator-control:hover, .hux-elevator-control:focus-visible :: background-color',
      '.hux-elevator-control:hover, .hux-elevator-control:focus-visible :: border-color',
      '.pager a:hover, .pager a:focus :: background-color',
      '.pager a:hover, .pager a:focus :: border-color',
    ])
  })

  test('--color-primary-600 retains its broader palette ownership and value', () => {
    expect(declaredValues('--color-primary-600')).toEqual(['@theme  :: #4db8d1'])
  })
})

/** 從 markup 取出帶指定 aria-label 的 <button> 開標籤,屬性順序無關。 */
function buttonTag(html: string, ariaLabel: string): string {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`))
  expect(match, `找不到 aria-label="${ariaLabel}" 的 button`).not.toBeNull()
  return (match as RegExpMatchArray)[0]
}

describe('navbar trigger 的語意 class', () => {
  // 斷言渲染結果而非原始碼字面:class 被搬到外層 wrapper 上時,字面搜尋照樣綠,
  // 但它就不再讀得到 --navbar-fg 了。三個 trigger 走同一套 oracle。
  test.each([
    ['ThemeSwitch', ThemeSwitch, 'Theme switcher'],
    ['MobileNavMenu', MobileNavMenu, 'Toggle navigation'],
    ['SearchButton', SearchButton, 'Search'],
  ])('%s 的 trigger button 帶 navbar-tool-trigger', (_name, Component, ariaLabel) => {
    const tag = buttonTag(renderToStaticMarkup(createElement(Component)), ariaLabel)
    const classes = tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? []
    // 逐 class 比對而不是子字串搜尋:navbar-tool-trigger-desktop 這種改名會讓 CSS
    // 選擇器對不上,但子字串搜尋(含 \b,因為連字號是非 word 字元)照樣通過。
    expect(classes).toContain('navbar-tool-trigger')
  })
})

describe('popup focus 的成對 token', () => {
  const PAIR = 'bg-[var(--hux-interactive)] text-[var(--hux-on-interactive)]'
  const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const occurrences = (source: string, needle: string) => source.split(needle).length - 1
  const focusBranches = (source: string) =>
    source.match(new RegExp(`focus\\s*\\?\\s*'${escapeForRegExp(PAIR)}'`, 'g'))?.length ?? 0

  // HeadlessUI 的 MenuItem 在選單關閉時根本不在 DOM 裡(renderToStaticMarkup 的輸出
  // 只有 trigger button),所以 focus 態的 class 沒有任何渲染層可以斷言。
  //
  // 比對「成對字串出現在 focus 分支的次數」而不是兩個字串各自的出現次數:後者對
  // 「把前景 token 搬到 else 分支」與「把整對搬到非 focus 的元素上」都是綠的 —— 計數
  // 表達不了位置。這裡要求每一次用到互動色,都是以成對形式出現在 focus 三元運算子上。
  test.each([['ThemeSwitch.tsx'], ['MobileNavMenu.tsx']])(
    '%s 的互動色只以成對形式出現在 focus 分支',
    (file) => {
      const source = readSource('components', file)
      const paired = focusBranches(source)
      expect(paired).toBeGreaterThan(0)
      expect(occurrences(source, 'bg-[var(--hux-interactive)]')).toBe(paired)
      expect(occurrences(source, 'text-[var(--hux-on-interactive)]')).toBe(paired)
    }
  )
})
