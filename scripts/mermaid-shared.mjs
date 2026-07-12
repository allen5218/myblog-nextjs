import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { remark } from 'remark'
import { visit } from 'unist-util-visit'
import matter from 'gray-matter'

// 刻意不用 `import.meta.url` 推導專案根目錄:contentlayer2 用 esbuild 把
// contentlayer.config.ts 連同它 import 的這個檔案一起打包進
// `.contentlayer/.cache/v*/compiled-contentlayer-config-*.mjs`,執行時
// import.meta.url 指向的是打包後暫存檔的位置,不是原始檔案位置,算出來的
// ROOT 會變成 `.contentlayer/.cache`,導致 PUBLIC_MERMAID_DIR 指向不存在的
// `.contentlayer/.cache/public/mermaid`——rehype-mermaid.mjs 的快取命中檢查
// 因此永遠失敗,靜默 fallback 成一般 code block(2026-07-12 Task 4 驗證時
// 實測到:contentlayer2 build 的 hash 與 public/mermaid 下的檔名完全一致,
// 但 fs.existsSync 仍回傳 false,才追出是路徑問題而非 hash 問題)。
// 改用 process.cwd():`yarn mermaid:render`、`next build`(進而觸發
// contentlayer2)一律從 repo 根目錄執行,與 contentlayer.config.ts 自己的
// `const root = process.cwd()` 用同一個假設,不受打包/複製影響。
const ROOT = process.cwd()

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
  const viewBox = out.match(/viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/)
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
  // fs.readdir 不保證跨平台順序一致(macOS 與 CI 的 ubuntu runner 可能不同),
  // 排序讓 render/processing 順序在各平台間穩定,避免順序相關的假差異。
  return nested.flat().sort()
}
