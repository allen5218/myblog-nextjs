import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import type { Root } from 'hast'
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
  it('code 子節點被語法高亮套件包成巢狀 <span> 時仍能正確擷取文字算出 hash', async () => {
    // 模擬 rehype-prism-plus 之類的插件已經跑過,把 <code> 的文字子節點
    // 拆成多個巢狀 <span class="code-line"> 包住的 text node,而不是單一
    // 直接文字子節點。若 codeText() 只掃 code 的「直接」文字子節點,這裡
    // 會回傳空字串,算出的 hash 對不上快取檔名,mermaid-figure 就永遠不會
    // 被换上,診斷需求文件裡描述的「靜默不出圖」就是這樣發生的。
    const nestedDef = 'graph TD\n  M-->N'
    const hash = hashDiagram(nestedDef)
    const lightFile = svgFileName(hash, 'light')
    const darkFile = svgFileName(hash, 'dark')
    await fs.writeFile(path.join(cacheDir, lightFile), '<svg/>')
    await fs.writeFile(path.join(cacheDir, darkFile), '<svg/>')

    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: { className: ['language-mermaid'] },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['code-line'] },
                  children: [{ type: 'text', value: 'graph TD\n' }],
                },
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['code-line'] },
                  children: [{ type: 'text', value: '  M-->N' }],
                },
              ],
            },
          ],
        },
      ],
    }

    const processor = unified().use(rehypeMermaid, { cacheDir, urlBase: '/mermaid' }).use(rehypeStringify)
    const transformedTree = processor.runSync(tree)
    const html = processor.stringify(transformedTree as Root)

    expect(html).toContain('mermaid-figure')
    expect(html).toContain(`/mermaid/${lightFile}`)
    expect(html).toContain(`/mermaid/${darkFile}`)
  })

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
