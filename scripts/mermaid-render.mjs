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
    let i = 0
    for (const [hash, def] of byHash) {
      for (const [variant, config] of VARIANTS) {
        const svg = await renderVariant(page, config, def, `mmd-${i}-${variant}`)
        out.set(svgFileName(hash, variant), svg)
      }
      i += 1
    }
    return out
  })
}

async function readCommitted(fileName) {
  try {
    return await fs.readFile(path.join(PUBLIC_MERMAID_DIR, fileName), 'utf8')
  } catch {
    return null
  }
}

async function runCheck(rendered) {
  const problems = []
  for (const [fileName, svg] of rendered) {
    const committed = await readCommitted(fileName)
    if (committed === null) problems.push(`缺少快取: ${fileName}`)
    else if (committed !== svg) problems.push(`快取過期: ${fileName}`)
  }
  // 找出已提交但不再屬於目前渲染集合的孤兒 SVG(圖表被刪除或改到雜湊變化後,
  // write 模式會自動清掉,但 --check 模式先前完全沒檢查這件事)。
  let existing = []
  try {
    existing = await fs.readdir(PUBLIC_MERMAID_DIR)
  } catch {
    existing = []
  }
  for (const name of existing) {
    if (name.endsWith('.svg') && !rendered.has(name)) {
      problems.push(`孤兒快取(已不被任何文章引用): ${name}`)
    }
  }
  if (problems.length) {
    console.error('mermaid 快取不新鮮,請執行 `yarn mermaid:render` 後 commit:')
    for (const p of problems) console.error('  - ' + p)
    process.exitCode = 1
  } else {
    console.log(`mermaid 快取新鮮(${rendered.size} 個檔案)`)
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
  const rendered = await renderAll(byHash)
  if (check) {
    await runCheck(rendered)
  } else {
    await writeAll(rendered, new Set(rendered.keys()))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
