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
export const CACHE_VERSION = 2

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
  // mermaid 把節點標籤裡的 `<br/>` 序列化成裸 `<br>` 寫進 foreignObject。HTML 合法,
  // XML 不合法 —— 而 rehype-mermaid 是用 `<img src>` 引這些 SVG,瀏覽器對 img 載入的
  // SVG 走嚴格 XML 解析,一個裸 `<br>` 就讓整份文件解析失敗:naturalWidth/Height 變 0、
  // 圖塌成一條細線。沒有 console 錯誤、請求還是 200,`mermaid-check` 的 hash 比對也照樣
  // 綠燈(它不解析輸出),所以只有真的把圖載進瀏覽器才看得出來(2026-07-25 踩過)。
  out = out.replace(/<br\s*>/gi, '<br/>')
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

/**
 * 從 SVG 字串的根標籤抽出固有尺寸。回傳 null 代表根標籤缺尺寸、非數字、或不是有限正數。
 *
 * **producer 與 consumer 共用同一個實作是刻意的。** producer(mermaid-render 寫檔前)
 * 若用瀏覽器的 DOMParser、consumer(rehype,在 Node 裡)用字串解析,兩者的接受集合不同,
 * 就會出現「producer 驗證過關、consumer 仍解析失敗」的縫隙 —— producer 的不變量因此
 * 只是「某個 parser 讀得到」,而不是我們真正要的「consumer 讀得到」。
 *
 * 回傳 null 而非丟錯,是為了讓呼叫端各自附上自己的脈絡(renderer 知道圖表 id、
 * rehype 知道檔案路徑),並各自決定錯誤語意。
 */
// SVG 的 <length> 是十進位寫法。`Number()` 會接受 "0x10"、"0b10" 這類 JS 數字字面值,
// 那不是合法的 SVG 屬性值 —— 放行等於讓瀏覽器與我們對固有尺寸的解讀不一致。
// 小數點後必須至少一位數字 —— `10.` 不是合法寫法。允許指數是因為 SVG 的 number
// 文法明確接受科學記號(`1e3`、`2.5E+2`),不是因為 mermaid 會不會輸出。
const SVG_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i

function svgLength(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!SVG_DECIMAL.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function parseSvgRootDimensions(svg) {
  // 必須是文件的**第一個**元素:不錨定的話 `<xyz width="10" height="20"><svg/></xyz>`
  // 會從前綴元素身上讀走尺寸,而它不是能直接餵給 <img> 的 SVG 資源。
  //
  // (`normalizeSvg` 只保證 `trim()`;「以 `<svg` 開頭」是 mermaid 輸出本來就有的性質、
  // 被原樣保留,不是 `normalizeSvg` 強制的。所以這裡是自己驗,不是信賴上游契約。)
  const opening = /^<svg(?=[\s/>])/i.exec(svg)
  if (!opening) return null

  // 循序吃 name="value" / name='value'。**不能**直接對整段字串搜尋 ` width="` ——
  // `data-note=' width="999"'` 這種屬性值裡的假字串會被當成真的 width 抓走。
  // 循序掃描會把引號內容整段吃掉,假字串因此不可能被誤認成屬性。
  const attribute = /\s+([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/giy
  // 用 `opening.index + …` 而不是只用長度:兩者目前等價(錨定保證 index 為 0),但寫死
  // 「從 4 開始」會讓錨定變成隱性承重 —— 日後若為了支援前置 XML declaration 放寬錨定,
  // 游標會靜默錯位到前一個元素身上,從它讀走 width/height。
  attribute.lastIndex = opening.index + opening[0].length
  const found = new Map()
  let cursor = attribute.lastIndex
  let match
  while ((match = attribute.exec(svg)) !== null) {
    const name = match[1].toLowerCase()
    // 同一個屬性出現兩次時哪一個生效由 parser 自己決定,不同實作可能不一致。
    // 與其猜,不如拒絕 —— 這是 fail-loud 而不是靜默選一個。
    if (found.has(name)) return null
    found.set(name, match[2] ?? match[3])
    cursor = attribute.lastIndex
  }
  // sticky 掃描停下來的原因**不只是**遇到標籤結尾,任何解析不了的 token 都會讓它停。
  // 少了這道檢查,`<svg width="10" height="20" BROKEN>` 會因為尺寸已先讀到而過關,
  // 後面的垃圾被靜默忽略。要求剩餘內容真的是標籤結尾,循序掃描的契約才成立。
  if (!/^\s*\/?>/.test(svg.slice(cursor))) return null

  const width = svgLength(found.get('width'))
  const height = svgLength(found.get('height'))
  if (width === null || height === null) return null
  // consumer 會 `Math.round` 後寫進 HTML 屬性,所以真正的不變量是「**取整後**仍為正」:
  // width="0.4" 的原始值 > 0,卻會輸出成 width="0",一樣保留不了版位。
  if (Math.round(width) <= 0 || Math.round(height) <= 0) return null
  return { width, height }
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
