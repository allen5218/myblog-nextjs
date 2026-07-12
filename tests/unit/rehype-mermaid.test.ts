import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeMermaid from '../../lib/rehype-mermaid.mjs'
import { hashDiagram, svgFileName } from '../../scripts/mermaid-shared.mjs'

const DEF = 'graph TD\n  A-->B'
let cacheDir: string

beforeAll(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmd-cache-'))
  const hash = hashDiagram(DEF)
  await fs.writeFile(path.join(cacheDir, svgFileName(hash, 'light')), '<svg/>')
  await fs.writeFile(path.join(cacheDir, svgFileName(hash, 'dark')), '<svg/>')
})

afterAll(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true })
})

function render(markdown: string, cacheDir: string) {
  return unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeMermaid, { cacheDir, urlBase: '/mermaid' })
    .use(rehypeStringify)
    .processSync(markdown)
    .toString()
}

describe('rehypeMermaid', () => {
  it('快取命中時把 mermaid fence 換成 figure + 兩個 img', () => {
    const hash = hashDiagram(DEF)
    const html = render('```mermaid\n' + DEF + '\n```\n', cacheDir)
    expect(html).toContain('mermaid-figure')
    expect(html).toContain(`/mermaid/${svgFileName(hash, 'light')}`)
    expect(html).toContain(`/mermaid/${svgFileName(hash, 'dark')}`)
    expect(html).not.toContain('language-mermaid')
  })

  it('快取未命中時保留原本的 code 區塊(退化,不丟錯)', () => {
    const html = render('```mermaid\ngraph TD\n  X-->Y\n```\n', cacheDir)
    expect(html).toContain('language-mermaid')
    expect(html).not.toContain('mermaid-figure')
  })

  it('非 mermaid 的程式碼區塊完全不受影響', () => {
    const html = render('```js\nconst x = 1\n```\n', cacheDir)
    expect(html).toContain('language-js')
    expect(html).not.toContain('mermaid-figure')
  })
})
