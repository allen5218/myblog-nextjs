import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AtRule, Declaration, Rule, parse } from 'postcss'
import { describe, expect, test } from 'vitest'

// `100vw` 依規範「包含」傳統捲軸寬度,而百分比、`left/right: 0`、auto margin 讀的
// containing block 不含。兩者在 overlay 捲軸下剛好相等,在「顯示捲軸=總是」的系統
// (macOS 接上滑鼠即會切換)差一個捲軸寬 —— 元素於是往右溢出,整頁多出一條水平捲軸。
//
// 這個 bug 有三個性質讓它特別會漏網,所以護欄放在 test:unit(必過的 ci job)裡:
//   1. 它只在傳統捲軸下出現,而 headless Chromium 一律是 overlay 捲軸(實測 gutter=0),
//      既有的 tests/playwright/* 在結構上不可能重現它,而且 test:parity 也不是必過檢查。
//   2. 溢出量只有半個捲軸寬(約 7px),肉眼只看得到「多了一條捲軸」,看不出偏移。
//   3. 它在視覺上是靜默的:元素同時往左偏同樣的量,LTR 下左側溢出不產生捲軸。
//
// 守不到的東西明列如下,不要以為有了這支就夠:
//   - 用 vw 以外的方式重新引入同一個錯誤(例如 JS 寫入 window.innerWidth)。
//   - 新增的選擇器若沿用 100vw,這支會擋;但若改用其他含捲軸的量測就擋不到。
//   - 實際渲染出來的幾何。那要靠傳統捲軸環境下的實測(headed Chromium)。
const stylesheet = parse(readFileSync(resolve(process.cwd(), 'css', 'tailwind.css'), 'utf8'))

/** 會決定元素水平位置或寬度的屬性;這些一旦吃到 vw,就可能撐出水平捲軸。 */
const HORIZONTAL_PROPS = new Set([
  'width',
  'min-width',
  'max-width',
  'margin',
  'margin-left',
  'margin-right',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'inset',
  'inset-inline',
  'inset-inline-start',
  'inset-inline-end',
  'left',
  'right',
])

/** 比對 `100vw`、`-50vw`、`calc(100vw - 1px)`,但不誤中 `100vh`、`50vmin`。 */
const VIEWPORT_WIDTH_UNIT = /(^|[\s(,+\-*/])-?\d*\.?\d+vw\b/

/**
 * 允許清單。每一筆都要寫明「為什麼這裡的 vw 不會撐出水平捲軸」,並釘死完整宣告值 ——
 * 只用 (選擇器, 屬性) 當 key 的話,把值換成另一個有害的 vw 運算式仍會通過。
 */
const ALLOWED: ReadonlyArray<{ selector: string; prop: string; value: string; reason: string }> = [
  {
    selector: '.post-container .prose pre',
    prop: 'width',
    value: 'calc(100vw)',
    reason:
      '手機版程式碼區塊的滿版出血。祖先 .post-container 是 overflow-x: hidden,多算的捲軸寬會被裁掉,' +
      '不會進入文件的可捲動溢出區;≥768px 另有規則覆寫成 width: 100%。',
  },
]

/** 把宣告壓成人看得懂的座標:媒體查詢條件必須入座,否則斷點內外會塌成同一個 key。 */
function scopeOf(decl: Declaration): string {
  const parts: string[] = []
  for (let node = decl.parent; node && node.type !== 'root'; node = node.parent) {
    if (node.type === 'rule') parts.unshift((node as Rule).selector.replace(/\s+/g, ' '))
    else if (node.type === 'atrule') {
      const at = node as AtRule
      parts.unshift(`@${at.name} ${at.params}`.trim())
    }
  }
  return parts.join(' | ')
}

function nearestSelector(decl: Declaration): string {
  for (let node = decl.parent; node && node.type !== 'root'; node = node.parent) {
    if (node.type === 'rule') return (node as Rule).selector.replace(/\s+/g, ' ')
  }
  return '(no rule)'
}

const viewportWidthDecls: Array<{ selector: string; prop: string; value: string; scope: string }> =
  []

stylesheet.walkDecls((decl) => {
  if (!HORIZONTAL_PROPS.has(decl.prop.toLowerCase())) return
  if (!VIEWPORT_WIDTH_UNIT.test(decl.value)) return
  viewportWidthDecls.push({
    selector: nearestSelector(decl),
    prop: decl.prop.toLowerCase(),
    value: decl.value.replace(/\s+/g, ' ').trim(),
    scope: scopeOf(decl),
  })
})

const isAllowed = (found: { selector: string; prop: string; value: string }) =>
  ALLOWED.some(
    (a) => a.selector === found.selector && a.prop === found.prop && a.value === found.value
  )

describe('水平尺寸不得用 vw 量測(vw 含傳統捲軸寬)', () => {
  test('沒有未經許可的 vw 水平尺寸宣告', () => {
    const violations = viewportWidthDecls.filter((d) => !isAllowed(d))
    expect(
      violations.map((d) => `${d.scope} { ${d.prop}: ${d.value} }`),
      '新增的 vw 水平尺寸會在傳統捲軸(macOS「顯示捲軸=總是」、Windows)下溢出半個捲軸寬。' +
        '請改用 100% / auto margin / left:right:0;確實安全的話,加進本檔的 ALLOWED 並寫明理由。'
    ).toEqual([])
  })

  test('允許清單本身沒有腐爛 —— 每一筆都必須仍存在於樣式表', () => {
    // 少了這條,ALLOWED 會在對應規則被刪改後靜默失效,變成一張無人察覺的免死金牌。
    const stale = ALLOWED.filter(
      (a) =>
        !viewportWidthDecls.some(
          (d) => d.selector === a.selector && d.prop === a.prop && d.value === a.value
        )
    )
    expect(stale.map((a) => `${a.selector} { ${a.prop}: ${a.value} }`)).toEqual([])
  })

  test('三個滿版容器不得再出現任何 vw 水平尺寸', () => {
    // 上面那條是通則,這條把本次修掉的三個具體對象釘死:它們是全站外殼,
    // 一旦回退就是每一頁都多一條水平捲軸,而不是單一頁面的區域性問題。
    const shells = ['.hux-full-bleed', '.navbar-custom', '.hux-home-layout', '.post-shell']
    const regressed = viewportWidthDecls.filter((d) =>
      shells.some((s) => d.selector.split(',').some((part) => part.trim().startsWith(s)))
    )
    expect(regressed.map((d) => `${d.scope} { ${d.prop}: ${d.value} }`)).toEqual([])
  })
})
