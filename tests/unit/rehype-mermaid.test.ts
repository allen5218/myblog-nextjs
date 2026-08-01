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

// light 與 dark 刻意用**不同**的兩軸數值:現有 10 組 committed SVG 的 light/dark 尺寸
// 剛好相同,所以「讀 light 套給 dark」的實作在 Playwright 層測不出來,只能在這裡守。
function svgFixture(width: number, height: number) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`
}
const LIGHT = { width: 261.5546875, height: 522 }
const DARK = { width: 263.25, height: 524.75 }

beforeAll(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mmd-cache-'))
  const hash = hashDiagram(DEF)
  await fs.writeFile(
    path.join(cacheDir, svgFileName(hash, 'light')),
    svgFixture(LIGHT.width, LIGHT.height)
  )
  await fs.writeFile(
    path.join(cacheDir, svgFileName(hash, 'dark')),
    svgFixture(DARK.width, DARK.height)
  )
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
    await fs.writeFile(path.join(cacheDir, lightFile), svgFixture(LIGHT.width, LIGHT.height))
    await fs.writeFile(path.join(cacheDir, darkFile), svgFixture(DARK.width, DARK.height))

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

  it('img 帶整數 width/height,且 light/dark 各自使用自己的尺寸', () => {
    const html = render('```mermaid\n' + DEF + '\n```\n', cacheDir)

    // 不能用 toContain 逐值比對:那只證明「這些數字出現過」,無法證明哪個值落在哪個
    // 元素上 —— 把 light 的尺寸寫到 dark 上,逐值比對照樣全綠。要守位置就得把
    // 每個 <img> 標籤整段抓出來各自檢查。
    const tags = html.match(/<img[^>]*>/g) ?? []
    expect(tags).toHaveLength(2)
    const light = tags.find((tag) => tag.includes('mermaid-light'))
    const dark = tags.find((tag) => tag.includes('mermaid-dark'))
    expect(light).toBeDefined()
    expect(dark).toBeDefined()

    // Math.round(261.5546875) === 262(截斷會得到 261,故此值抓得到漏 round)
    expect(light).toContain('width="262"')
    expect(light).toContain('height="522"')
    expect(dark).toContain('width="263"')
    expect(dark).toContain('height="525"')
  })

  it('快取檔案存在但根標籤沒有合法尺寸時丟錯並指出路徑(不得靜默退化)', async () => {
    // mermaid-check 只比對檔名,對「檔案在、尺寸缺」這種狀態是綠的 —— 靜默退化
    // 等於新增一條 render/check/build 全綠卻在 production 退化的路徑。
    const brokenDef = 'graph TD\n  P-->Q'
    const hash = hashDiagram(brokenDef)
    await fs.writeFile(path.join(cacheDir, svgFileName(hash, 'light')), '<svg></svg>')
    await fs.writeFile(path.join(cacheDir, svgFileName(hash, 'dark')), '<svg></svg>')

    expect(() => render('```mermaid\n' + brokenDef + '\n```\n', cacheDir)).toThrow(
      new RegExp(svgFileName(hash, 'light'))
    )
  })

  it('非 mermaid 的程式碼區塊完全不受影響', () => {
    const html = render('```js\nconst x = 1\n```\n', cacheDir)
    expect(html).toContain('language-js')
    expect(html).not.toContain('mermaid-figure')
  })
})
