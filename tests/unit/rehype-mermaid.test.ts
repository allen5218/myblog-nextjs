import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
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

/** 回傳轉換後的 HAST,讓斷言能看 property 而不是序列化字串。 */
function transform(markdown: string, cacheDir: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeMermaid, { cacheDir, urlBase: '/mermaid' })
  return processor.runSync(processor.parse(markdown)) as Root
}

function images(tree: Root): Element[] {
  const found: Element[] = []
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'img') found.push(node)
  })
  return found
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

  it('每個 img 的 class、src 與整數尺寸綁在同一個節點上', () => {
    const hash = hashDiagram(DEF)
    // **斷言必須看 HAST property,不能看序列化後的字串。** 若實作把 property 誤寫成
    // `dataWidth`,序列化是 `data-width="262"`,而 `includes('width="262"')` 對它是 true
    // —— img 完全沒有尺寸屬性,字串比對卻全綠。同時比對 src 是為了擋「class、尺寸、
    // 檔案整組錯配」的實作。
    const tags = images(transform('```mermaid\n' + DEF + '\n```\n', cacheDir))
    expect(tags).toHaveLength(2)
    const light = tags.find((node) => (node.properties?.className as string[])?.includes('mermaid-light'))
    const dark = tags.find((node) => (node.properties?.className as string[])?.includes('mermaid-dark'))

    // Math.round(261.5546875) === 262(截斷會得到 261,故此值抓得到漏 round)
    expect(light?.properties).toMatchObject({
      src: `/mermaid/${svgFileName(hash, 'light')}`,
      loading: 'lazy',
      width: 262,
      height: 522,
    })
    expect(dark?.properties).toMatchObject({
      src: `/mermaid/${svgFileName(hash, 'dark')}`,
      loading: 'lazy',
      width: 263,
      height: 525,
    })
  })

  // mermaid-check 只比對檔名,對「檔案在、尺寸缺」這種狀態是綠的 —— 靜默退化
  // 等於新增一條 render/check/build 全綠卻在 production 退化的路徑。
  //
  // 兩個變體各測一次:只測「兩份都壞」的話,實作只要先驗 light 就會先 throw,
  // 「dark 的非法尺寸被靜默退化」這個 bug 照樣漏掉。
  it.each([
    ['light', 'graph TD\n  P-->Q'],
    ['dark', 'graph TD\n  R-->S'],
  ] as const)('只有 %s 變體尺寸損壞時仍丟錯並指出該檔', async (broken, def) => {
    const hash = hashDiagram(def)
    for (const variant of ['light', 'dark'] as const) {
      await fs.writeFile(
        path.join(cacheDir, svgFileName(hash, variant)),
        variant === broken ? '<svg></svg>' : svgFixture(LIGHT.width, LIGHT.height)
      )
    }
    expect(() => render('```mermaid\n' + def + '\n```\n', cacheDir)).toThrow(
      new RegExp(svgFileName(hash, broken))
    )
  })

  // 缺檔有 mermaid-check 兜底,不該遮住沒有防線的「存在但損壞」。
  it('一份缺檔、另一份損壞時,揭露損壞的那份而不是靜默退化', async () => {
    const def = 'graph TD\n  T-->U'
    const hash = hashDiagram(def)
    await fs.writeFile(path.join(cacheDir, svgFileName(hash, 'dark')), '<svg></svg>')

    expect(() => render('```mermaid\n' + def + '\n```\n', cacheDir)).toThrow(
      new RegExp(svgFileName(hash, 'dark'))
    )
  })

  it.each([['light'], ['dark']] as const)(
    '只有 %s 變體缺檔(另一份有效)時退化成程式碼區塊,不丟錯',
    async (missing) => {
      const def = `graph TD\n  V-->W${missing}`
      const hash = hashDiagram(def)
      const present = missing === 'light' ? 'dark' : 'light'
      await fs.writeFile(
        path.join(cacheDir, svgFileName(hash, present)),
        svgFixture(LIGHT.width, LIGHT.height)
      )

      const html = render('```mermaid\n' + def + '\n```\n', cacheDir)
      expect(html).toContain('language-mermaid')
      expect(html).not.toContain('mermaid-figure')
    }
  )

  it('非 mermaid 的程式碼區塊完全不受影響', () => {
    const html = render('```js\nconst x = 1\n```\n', cacheDir)
    expect(html).toContain('language-js')
    expect(html).not.toContain('mermaid-figure')
  })
})
