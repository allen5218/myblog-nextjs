import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import { visit } from 'unist-util-visit'
import type { Element } from 'hast'
import {
  extractMermaidDefinitions,
  hashDiagram,
  markdownFiles,
  svgFileName,
  PUBLIC_MERMAID_DIR,
} from '../../scripts/mermaid-shared.mjs'

const BLOG_DIR = path.join(process.cwd(), 'data/blog')

// 不能用 `startsWith('gantt')` 判斷圖種:mermaid 的 init directive(`%%{init: …}%%`)
// 與註解可以出現在關鍵字之前,`\b` 讓 `ganttSomething` 這類前綴不被誤判,
// `i` 對應 mermaid lexer 對關鍵字大小寫不敏感。
const GANTT_HEADER = /^\s*gantt\b/im

async function ganttDefinitions(): Promise<{ source: string; definition: string }[]> {
  const files: string[] = await markdownFiles(BLOG_DIR)
  const found: { source: string; definition: string }[] = []
  for (const file of files) {
    const markdown = await fs.readFile(file, 'utf8')
    for (const definition of extractMermaidDefinitions(markdown) as string[]) {
      if (GANTT_HEADER.test(definition)) {
        found.push({ source: path.relative(process.cwd(), file), definition })
      }
    }
  }
  return found
}

/**
 * 從所有元素的 class 屬性抽出 token。
 *
 * **用真正的 parser,不用自己比對。** 這條路先後試過三版(一版精確字串 + 兩版 regex),
 * 每一版都被合法輸入穿透,而且失敗方向包含**假綠**(該抓的沒抓到):
 *
 * - 精確比對 `class="today"` → 被 `class="today marker"`、`class='today'` 繞過
 * - 單一 regex 找 `class=` → `[^>]*` 是 greedy,會回溯到標籤內最後一個 `class=`,
 *   於是 `<g class="today" data-note=' class="other"'>` 只抓到假的那個
 * - 剝註解/CDATA 後逐標籤掃 → 實體編碼的 `class="to&#100;ay"` 看不見(**管線可達**);
 *   `<?pi <!-- ?><svg><g class="today"/></svg><?pi --> ?>` 這種合法 XML(xmllint 驗過)
 *   也會讓剝除從第一個 PI 一路吃到第二個、把真的 today 刪掉(這個**管線不可達** ——
 *   前置 PI 過不了 producer 的根標籤錨定 —— 但它證明了 pattern 的方向本身有問題)
 *
 * 根本問題是**剝除 XML 結構本身就需要理解 XML 結構**。`hast-util-from-html-isomorphic`
 * 與 `unist-util-visit` 都已經是本 repo 的直接依賴(後者 `lib/rehype-mermaid.mjs` 就在用),
 * 所以正確做法零成本:交給 parser,它自己處理實體、namespace、註解、CDATA 與屬性值裡的
 * 假標籤。合法性由 producer 端的 `DOMParser` 負責,這裡只需要讀已經合法的 SVG。
 */
function classTokens(svg: string): string[] {
  const tokens = new Set<string>()
  visit(fromHtmlIsomorphic(svg, { fragment: true }), 'element', (node: Element) => {
    const className = node.properties?.className
    if (className === undefined) return
    // hast 把 class 當 space-separated property,一律正規化成陣列(實測 20 個產物、
    // 1482 個帶 class 的元素全是陣列)。所以這裡**不寫**字串分支 —— 那會是永遠不執行的
    // 死防禦。但也不能默默 return:若日後正規化改變,靜默略過就是假綠,所以直接爆。
    if (!Array.isArray(className)) {
      throw new Error(`預期 hast 把 class 正規化成陣列,實際是 ${typeof className}`)
    }
    for (const value of className) {
      const token = String(value)
      if (token) tokens.add(token)
    }
  })
  return [...tokens]
}

describe('gantt today marker', () => {
  // 正控制:掃描若壞掉(路徑改了、圖種判斷失效),下面兩條會因為集合是空的而
  // 空轉通過。這條讓那種失敗變成紅燈而不是假綠。
  it('掃得到至少一張 gantt', async () => {
    expect((await ganttDefinitions()).length).toBeGreaterThan(0)
  })

  // build 時渲染的 gantt 會把「今天」凍結在渲染那一刻:日期範圍涵蓋今天的圖,
  // committed SVG 會從隔天起對讀者說謊。mermaid-check 只比對檔名、不讀內容,抓不到。
  // 掃全 data/blog 而不是單一 fixture —— 契約是「所有靜態 gantt」,不是某一張。
  it('每一張 gantt 都關閉 today marker', async () => {
    for (const { source, definition } of await ganttDefinitions()) {
      expect(definition, `${source} 的 gantt 缺少 todayMarker off`).toMatch(
        /^\s*todayMarker\s+off\s*$/m
      )
    }
  })

  // 這條同時抓「directive 還在但忘了重新 render」—— 那時 hash 已變,
  // 讀不到對應檔案會直接 ENOENT 失敗。
  it('每一張 gantt 的兩份 committed SVG 都不含 today 元素', async () => {
    for (const { source, definition } of await ganttDefinitions()) {
      const hash = hashDiagram(definition)
      for (const variant of ['light', 'dark'] as const) {
        const file = path.join(PUBLIC_MERMAID_DIR, svgFileName(hash, variant))
        const svg = await fs.readFile(file, 'utf8')
        expect(classTokens(svg), `${source} 的 ${variant} 變體仍含 today marker`).not.toContain(
          'today'
        )
      }
    }
  })
})

describe('classTokens', () => {
  // 這個 helper 就是上面那條斷言的鑑別力所在,所以它自己要有測試:
  // 三種寫法都帶真正的 today token,精確字串比對只抓得到第一種。
  it.each([
    ['雙引號單一 class', '<g class="today"><line/></g>'],
    ['多個 class', '<g class="today marker"><line/></g>'],
    ['單引號', "<g class='today'><line/></g>"],
    // 這一條守 greedy 回溯:單一 regex 的 `[^>]*` 會回溯到最後一個 class=,
    // 只抓到屬性值裡的假 class 而漏掉真正的 today。
    ['真 class 之後有屬性值裡的假 class', `<g class="today" data-note=' class="other"'><line/></g>`],
  ])('%s 都抓得到 today token', (_label, svg) => {
    expect(classTokens(svg)).toContain('today')
  })

  // namespace 前綴若沒被標籤名 regex 吃下,內層掃描會對不上 —— 那是**假綠**,
  // 也就是 today marker 真的在產物裡卻沒被抓到,比假紅危險得多。
  it('帶 namespace 前綴的標籤也抓得到 today token', () => {
    expect(classTokens('<s:g class="today"><s:line/></s:g>')).toContain('today')
  })

  // 以下三種都是**假紅**來源:`today` 出現在不是 class 屬性的地方。
  it.each([
    ['<style> 裡的樣式規則', '<svg><style>#mmd .today{fill:none;stroke:red}</style><g/></svg>'],
    ['XML 註解裡的標籤', '<svg><!-- <g class="today"> --><g/></svg>'],
    ['CDATA 裡的標籤', `<svg><style><![CDATA[content: "<g class='today'>";]]></style><g/></svg>`],
    ['屬性值裡的假標籤', `<svg><g data-note="<fake class='today'>"/></svg>`],
  ])('不把 %s 當成 today token', (_label, svg) => {
    expect(classTokens(svg)).not.toContain('today')
  })

  // 實體編碼在解碼後就是 today。先前的 regex 版本看不見它,而且把這個假綠寫成
  // 「會通過的測試」—— 那等於把缺陷定義成成功,真正修好時反而變紅。
  it('實體編碼的 class 解碼後也抓得到 today token', () => {
    expect(classTokens('<g class="to&#100;ay"/>')).toContain('today')
  })

  // 合法 XML,但 regex 版本的剝除會從第一個 processing instruction 裡的 `<!--`
  // 一路吃到第二個裡的 `-->`,把中間真正的 today 元素整段刪掉 —— 假綠。
  it('processing instruction 裡的 <!-- 不會吃掉後面真正的 today 元素', () => {
    expect(
      classTokens('<?pi <!-- ?><svg><g class="today"/></svg><?pi --> ?>')
    ).toContain('today')
  })
})
