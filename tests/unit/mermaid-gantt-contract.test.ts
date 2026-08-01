import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  extractMermaidDefinitions,
  hashDiagram,
  svgFileName,
  PUBLIC_MERMAID_DIR,
} from '../../scripts/mermaid-shared.mjs'

const FIXTURE = path.join(process.cwd(), 'data/blog/hidden/2025-08-29-mermaid-v10-test.md')

async function ganttDefinition(): Promise<string> {
  const markdown = await fs.readFile(FIXTURE, 'utf8')
  const gantt = extractMermaidDefinitions(markdown).filter((def: string) =>
    def.trimStart().startsWith('gantt')
  )
  expect(gantt).toHaveLength(1)
  return gantt[0]
}

describe('gantt today marker', () => {
  // build 時渲染的 gantt 會把「今天」凍結在渲染那一刻:日期範圍涵蓋今天的圖,
  // committed SVG 會從隔天起對讀者說謊。mermaid-check 只比對檔名、不讀內容,抓不到。
  it('定義明確關閉 today marker', async () => {
    expect(await ganttDefinition()).toMatch(/^\s*todayMarker\s+off\s*$/m)
  })

  // 這條同時抓「directive 還在但忘了重新 render」—— 那時 hash 已變,
  // 讀不到對應檔案會直接 ENOENT 失敗。
  //
  // 斷言用 `class="today"` 而非 `today`:SVG 內嵌樣式表有
  // `#mmd-… .today{fill:none;stroke:red}`,它不含字串 `class="today"`,不會誤報。
  it('committed 的兩份 SVG 都不含 today 元素', async () => {
    const hash = hashDiagram(await ganttDefinition())
    for (const variant of ['light', 'dark'] as const) {
      const file = path.join(PUBLIC_MERMAID_DIR, svgFileName(hash, variant))
      const svg = await fs.readFile(file, 'utf8')
      expect(svg, `${variant} 變體仍含 today marker`).not.toContain('class="today"')
    }
  })
})
