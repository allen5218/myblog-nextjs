import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import {
  extractMermaidDefinitions,
  markdownFiles,
  hashDiagram,
  svgFileName,
  normalizeSvg,
  LIGHT_THEME,
  DARK_THEME,
  PUBLIC_MERMAID_DIR,
} from './mermaid-shared.mjs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOG_DIR = path.resolve(__dirname, '..', 'data', 'blog')
const MERMAID_UMD = require.resolve('mermaid/dist/mermaid.min.js')

const VARIANTS = [
  ['light', LIGHT_THEME],
  ['dark', DARK_THEME],
]

async function collectDefinitions() {
  const files = await markdownFiles(BLOG_DIR)
  const byHash = new Map()
  for (const file of files) {
    const md = await fs.readFile(file, 'utf8')
    for (const def of extractMermaidDefinitions(md)) {
      byHash.set(hashDiagram(def), def)
    }
  }
  return byHash // Map<hash, definition>
}

async function withBrowser(fn) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ path: MERMAID_UMD })
    return await fn(page)
  } finally {
    await browser.close()
  }
}

async function renderVariant(page, config, def, id) {
  const svg = await page.evaluate(
    async ({ config, def, id }) => {
      // mermaid 的部分圖表型別(實測 gitGraph、classDiagram)排版內部會呼叫
      // Math.random(對同一定義重渲染兩次,座標會不同、SVG bytes 不同),
      // 導致 --check 對完全沒改的圖表也一直誤報過期、每次 render 都產生假 diff。
      // 用固定種子的簡單 LCG 蓋掉 Math.random,讓「相同定義 + 相同主題」
      // 永遠產出逐位元組相同的 SVG。每次呼叫都重置種子,不受呼叫順序影響。
      let seed = 0x2f6e2b1
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        // 除以 0x80000000(2^31)而非 0x7fffffff,確保結果嚴格 < 1,
        // 符合 Math.random() 的 [0, 1) 契約(seed 可能取到 0x7fffffff 本身)。
        return seed / 0x80000000
      }
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...config })
      const { svg } = await window.mermaid.render(id, def)
      return svg
    },
    { config, def, id }
  )
  return normalizeSvg(svg)
}

// 回傳 Map<fileName, svgString>
async function renderAll(byHash) {
  return withBrowser(async (page) => {
    const out = new Map()
    for (const [hash, def] of byHash) {
      for (const [variant, config] of VARIANTS) {
        const svg = await renderVariant(page, config, def, `mmd-${hash}-${variant}`)
        out.set(svgFileName(hash, variant), svg)
      }
    }
    return out
  })
}

// --check 模式:純結構比對,不重新渲染、不啟動瀏覽器。
// 目的只在抓「作者新增/改動了 mermaid 圖,卻忘了 `yarn mermaid:render` + commit」。
// 用內容 hash ↔ 檔名對應即可判斷,刻意不比對 SVG bytes:mermaid 在瀏覽器裡要量測
// 文字(字體、字寬),macOS(作者)與 Linux(CI runner)的結果本就不同,byte 比對
// 會跨平台永遠失敗(狼來了)。hash 只由內容(定義 + 主題 + CACHE_VERSION)決定,
// 跨平台一致;產品端 SVG 是靜態檔,誰渲染的都一樣顯示,平台差異不影響正確性。
async function runCheck(byHash) {
  const expected = new Set()
  for (const hash of byHash.keys()) {
    for (const [variant] of VARIANTS) expected.add(svgFileName(hash, variant))
  }
  let committed = []
  try {
    committed = (await fs.readdir(PUBLIC_MERMAID_DIR)).filter((n) => n.endsWith('.svg'))
  } catch {
    committed = []
  }
  const committedSet = new Set(committed)
  const problems = []
  for (const name of expected) {
    if (!committedSet.has(name)) problems.push(`缺少快取(新增/改動的圖尚未渲染?): ${name}`)
  }
  for (const name of committed) {
    if (!expected.has(name)) problems.push(`孤兒快取(圖已刪除或改動): ${name}`)
  }
  if (problems.length) {
    console.error('mermaid 快取與文章內容不符,請執行 `yarn mermaid:render` 後 commit:')
    for (const p of problems) console.error('  - ' + p)
    process.exitCode = 1
  } else {
    console.log(`mermaid 快取結構一致(${byHash.size} 張圖 → ${expected.size} 個 SVG)`)
  }
}

async function writeAll(rendered, validNames) {
  await fs.mkdir(PUBLIC_MERMAID_DIR, { recursive: true })
  for (const [fileName, svg] of rendered) {
    await fs.writeFile(path.join(PUBLIC_MERMAID_DIR, fileName), svg, 'utf8')
  }
  // 清掉不再被任何文章引用的舊 SVG
  let existing = []
  try {
    existing = await fs.readdir(PUBLIC_MERMAID_DIR)
  } catch {
    existing = []
  }
  for (const name of existing) {
    if (name.endsWith('.svg') && !validNames.has(name)) {
      await fs.unlink(path.join(PUBLIC_MERMAID_DIR, name))
    }
  }
  console.log(`mermaid 已寫入 ${rendered.size} 個 SVG`)
}

async function main() {
  const check = process.argv.includes('--check')
  const byHash = await collectDefinitions()
  if (check) {
    // 結構檢查不需渲染,不啟動瀏覽器(故 CI 也不必裝 Chromium)。
    await runCheck(byHash)
  } else {
    const rendered = await renderAll(byHash)
    await writeAll(rendered, new Set(rendered.keys()))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
