import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { remark } from 'remark'
import { visit } from 'unist-util-visit'
import matter from 'gray-matter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// 任何會影響輸出 SVG 的東西改變(mermaid 版本、主題、渲染邏輯)時 bump,
// 強制快取失效。實際位元差異另由 `mermaid:render --check` 兜底。
export const CACHE_VERSION = 1

export const PUBLIC_MERMAID_DIR = path.join(ROOT, 'public', 'mermaid')
export const MERMAID_URL_BASE = '/mermaid'

const BRAND = '#4db8d1'

export const LIGHT_THEME = {
  theme: 'base',
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#e8f6fb',
    primaryBorderColor: BRAND,
    primaryTextColor: '#1f2937',
    secondaryColor: '#f3f4f6',
    tertiaryColor: '#f9fafb',
    lineColor: '#0085a1',
    textColor: '#1f2937',
    fontSize: '16px',
  },
}

export const DARK_THEME = {
  theme: 'base',
  themeVariables: {
    background: '#111111',
    primaryColor: '#123039',
    primaryBorderColor: BRAND,
    primaryTextColor: '#f3f4f6',
    secondaryColor: '#1f2937',
    tertiaryColor: '#0b1220',
    lineColor: BRAND,
    textColor: '#e5e7eb',
    fontSize: '16px',
  },
}

export function normalizeDefinition(def) {
  return def.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

export function hashDiagram(def) {
  const payload = [
    CACHE_VERSION,
    JSON.stringify(LIGHT_THEME),
    JSON.stringify(DARK_THEME),
    normalizeDefinition(def),
  ].join('\n')
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

export function svgFileName(hash, variant) {
  return `${hash}.${variant}.svg`
}

export function normalizeSvg(svg) {
  let out = svg
  // viewBox 的 origin(前兩個數字)在 timeline、gitGraph、sequence 等圖表型別
  // 常是非零甚至負值(例如 "100 -61 1190 592.2"),不能假設是 "0 0" 開頭 ——
  // 用來當寬高的是第 3、4 個數字(寬、高),與 origin 無關。
  const viewBox = out.match(
    /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/
  )
  // 移除 mermaid 內嵌的 max-width inline style 與 width="100%",改用固定像素
  // 尺寸,讓 <img> 有明確的固有寬高、過寬時由外層容器產生水平捲動。
  out = out.replace(/style="max-width:[^"]*"/i, '')
  out = out.replace(/(<svg[^>]*?)\swidth="100%"/i, '$1')
  if (viewBox) {
    const [, , , w, h] = viewBox
    if (/<svg[^>]*\swidth="/i.test(out)) {
      out = out.replace(/(<svg[^>]*?)\swidth="[^"]*"/i, `$1 width="${w}"`)
    } else {
      out = out.replace(/<svg\b/i, `<svg width="${w}"`)
    }
    if (/<svg[^>]*\sheight="/i.test(out)) {
      out = out.replace(/(<svg[^>]*?)\sheight="[^"]*"/i, `$1 height="${h}"`)
    } else {
      out = out.replace(/<svg\b/i, `<svg height="${h}"`)
    }
  }
  return out.trim()
}

export function extractMermaidDefinitions(markdown) {
  const { content } = matter(markdown)
  const tree = remark().parse(content)
  const defs = []
  visit(tree, 'code', (node) => {
    if (node.lang === 'mermaid') defs.push(node.value)
  })
  return defs
}

export async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(entryPath)
      return /\.(md|mdx|markdown)$/.test(entry.name) ? [entryPath] : []
    })
  )
  return nested.flat()
}
