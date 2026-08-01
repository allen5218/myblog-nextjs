import fs from 'node:fs'
import path from 'node:path'
import { visit } from 'unist-util-visit'
import {
  hashDiagram,
  svgFileName,
  parseSvgRootDimensions,
  PUBLIC_MERMAID_DIR,
  MERMAID_URL_BASE,
} from '../scripts/mermaid-shared.mjs'

function codeText(node) {
  if (node.type === 'text') return node.value ?? ''
  if (!node.children) return ''
  return node.children.map(codeText).join('')
}

function isMermaidCode(codeNode) {
  const cls = codeNode.properties?.className
  return Array.isArray(cls) && cls.includes('language-mermaid')
}

function imgNode(className, src, dimensions) {
  return {
    type: 'element',
    tagName: 'img',
    properties: {
      className: [className],
      src,
      alt: 'Mermaid diagram',
      loading: 'lazy',
      // HTML 的 width/height 內容屬性是**非負整數**,而 mermaid 的 viewBox 幾乎都是小數
      // (現有 10 組有 7 組至少一軸是小數)。與其依賴各瀏覽器對非法值的容錯行為,主動取整。
      // 代價是載入前後最多約 0.889px 的次像素更新 —— 遠小於原本完全不保留版位的位移。
      width: Math.round(dimensions.width),
      height: Math.round(dimensions.height),
    },
    children: [],
  }
}

/**
 * 讀快取 SVG 的固有尺寸。
 *
 * 回傳 null 只有一種意思:**檔案不存在**(快取未命中)—— 呼叫端退化成程式碼區塊,
 * 這條路徑由 `mermaid-check` 的缺檔回報兜底。
 *
 * 檔案存在卻讀不到合法尺寸則**丟錯**:`mermaid-check` 完全不會回報這種狀態
 * (它只比對檔名、不讀內容),靜默退化等於新增一條沒有任何防線的失敗路徑。
 */
function readSvgDimensions(filePath) {
  let svg
  try {
    svg = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  const dimensions = parseSvgRootDimensions(svg)
  if (!dimensions) {
    throw new Error(
      `${filePath}: mermaid 快取的 SVG 根標籤沒有合法的 width/height。` +
        '請重跑 `yarn mermaid:render` 後 commit。'
    )
  }
  return dimensions
}

export default function rehypeMermaid(options = {}) {
  const cacheDir = options.cacheDir ?? PUBLIC_MERMAID_DIR
  const urlBase = options.urlBase ?? MERMAID_URL_BASE
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === null || index === undefined) return
      const code = node.children.find((c) => c.type === 'element' && c.tagName === 'code')
      if (!code || !isMermaidCode(code)) return

      const hash = hashDiagram(codeText(code))
      const lightFile = svgFileName(hash, 'light')
      const darkFile = svgFileName(hash, 'dark')
      // 快取未命中:保留原節點,退化為程式碼區塊
      const lightDimensions = readSvgDimensions(path.join(cacheDir, lightFile))
      if (!lightDimensions) return
      const darkDimensions = readSvgDimensions(path.join(cacheDir, darkFile))
      if (!darkDimensions) return

      parent.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['mermaid-figure', 'overflow-x-auto'] },
        children: [
          imgNode('mermaid-light', `${urlBase}/${lightFile}`, lightDimensions),
          imgNode('mermaid-dark', `${urlBase}/${darkFile}`, darkDimensions),
        ],
      }
    })
  }
}
