import fs from 'node:fs'
import path from 'node:path'
import { visit } from 'unist-util-visit'
import {
  hashDiagram,
  svgFileName,
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

function imgNode(className, src) {
  return {
    type: 'element',
    tagName: 'img',
    properties: { className: [className], src, alt: 'Mermaid diagram', loading: 'lazy' },
    children: [],
  }
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
      if (
        !fs.existsSync(path.join(cacheDir, lightFile)) ||
        !fs.existsSync(path.join(cacheDir, darkFile))
      ) {
        return // 快取未命中:保留原節點,退化為程式碼區塊
      }

      parent.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['mermaid-figure', 'overflow-x-auto'] },
        children: [
          imgNode('mermaid-light', `${urlBase}/${lightFile}`),
          imgNode('mermaid-dark', `${urlBase}/${darkFile}`),
        ],
      }
    })
  }
}
