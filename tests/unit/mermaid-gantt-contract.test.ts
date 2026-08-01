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
 * 從 opening tag 的 class 屬性抽出所有 token。
 *
 * 刻意**不**比對 `class="today"` 這種精確字串 —— `class="today marker"` 與
 * `class='today'` 都帶著真正的 today token 卻不含那個字串,精確比對會被穿透。
 * 按 token 比對同時仍會避開 `<style>` 區塊裡的 `.today{…}` 樣式規則
 * (那不在任何 opening tag 的 class 屬性裡)。
 */
function classTokens(svg: string): string[] {
  const tokens = new Set<string>()
  for (const match of svg.matchAll(/<[a-z][^>]*\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const token of (match[1] ?? match[2] ?? '').split(/\s+/)) {
      if (token) tokens.add(token)
    }
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
  ])('%s 都抓得到 today token', (_label, svg) => {
    expect(classTokens(svg)).toContain('today')
  })

  it('不把 <style> 區塊裡的 .today 規則當成 today token', () => {
    expect(classTokens('<svg><style>#mmd .today{fill:none;stroke:red}</style><g/></svg>')).toEqual(
      []
    )
  })
})
