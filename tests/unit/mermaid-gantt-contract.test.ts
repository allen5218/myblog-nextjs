import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
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
 * 從所有 opening tag 的 class 屬性抽出 token。
 *
 * 刻意**不**比對 `class="today"` 這種精確字串 —— `class="today marker"` 與
 * `class='today'` 都帶著真正的 today token 卻不含那個字串,精確比對會被穿透。
 * 按 token 比對同時仍會避開 `<style>` 區塊裡的 `.today{…}` 樣式規則
 * (那不在任何 opening tag 的 class 屬性裡)。
 *
 * **也不能用單一 regex 直接找 `class="…"`。** `<[a-z][^>]*\sclass=` 裡的 `[^>]*` 是
 * greedy,會回溯到標籤內**最後一個** ` class=`,於是
 * `<g class="today" data-note=' class="other"'>` 只抓得到屬性值裡的假 class,真正的
 * today 反而被漏掉。
 *
 * 這裡是**單向前掃**:剝掉註解與 CDATA,逐標籤循序吃屬性,吃完把游標推過整個
 * opening tag —— 屬性值裡的 `<fake class='today'>` 因此不會被當成新標籤。
 *
 * **已知限制(刻意不處理)**:實體編碼的 class(`class="to&#100;ay"`)看不出來,
 * 那需要真正的 XML parser。mermaid 不會這樣輸出 today marker,為此加一個依賴不划算;
 * mermaid 升級本來就另有「目視確認幾張圖」的守則(見 AGENTS.md)。
 */
function classTokens(svg: string): string[] {
  const tokens = new Set<string>()
  const source = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  // 標籤名要吃得下 namespace 前綴(`<s:g>`),否則內層掃描會對不上而**漏掉**該標籤的 class。
  const tagStart = /<([a-z_:][-a-z0-9_:.]*)/gi
  const attribute = /\s+([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/giy
  let opening: RegExpExecArray | null
  while ((opening = tagStart.exec(source)) !== null) {
    let cursor = opening.index + opening[0].length
    attribute.lastIndex = cursor
    let match: RegExpExecArray | null
    while ((match = attribute.exec(source)) !== null) {
      cursor = attribute.lastIndex
      if (match[1].toLowerCase() !== 'class') continue
      for (const token of (match[2] ?? match[3] ?? '').split(/\s+/)) {
        if (token) tokens.add(token)
      }
    }
    // 把外層掃描推過已消化的 opening tag。sticky regex 在 exec 回傳 null 時會把
    // lastIndex 歸零,所以游標必須自己在迴圈內累進,不能事後讀 attribute.lastIndex。
    tagStart.lastIndex = Math.max(tagStart.lastIndex, cursor)
  }
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

  // 刻意記錄的已知限制:實體編碼看不出來,那需要真正的 XML parser。
  // 寫成測試是為了讓限制**可見**,而不是讓它靜靜地待在註解裡等人踩。
  it('已知限制:實體編碼的 class 抓不到(需要真正的 XML parser)', () => {
    expect(classTokens('<g class="to&#100;ay"/>')).not.toContain('today')
  })
})
