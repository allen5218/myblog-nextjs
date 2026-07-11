import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectOgFontText } from './og-font-text.mjs'
import { canSkipMissingHarfBuzz } from './og-font-check-policy.mjs'

const root = process.cwd()
const text = await collectOgFontText(root)
const fonts = ['ChironSungHK-OG-Regular.ttf', 'ChironSungHK-OG-Bold.ttf']

// 文字必須走 --text-file 而不是 argv:argv 會經過呼叫端 locale 的編碼轉換,
// 在沒設 UTF-8 locale 的 shell(CI、非互動環境)hb-shape 會對 CJK 直接報
// 「轉換輸入資料時遇到不正確的位元組組合」;--text-file 一律按 UTF-8 讀。
const cacheDirectory = path.join(os.tmpdir(), 'myblog-nextjs-og-font')
const glyphText = path.join(cacheDirectory, 'og-glyphs-check.txt')
await fs.mkdir(cacheDirectory, { recursive: true })
await fs.writeFile(glyphText, text)

for (const font of fonts) {
  const fontPath = path.join(root, 'public/static/fonts', font)
  const result = spawnSync('hb-shape', [fontPath, `--text-file=${glyphText}`], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  })
  if (result.error?.code === 'ENOENT') {
    if (canSkipMissingHarfBuzz(process.env)) {
      console.warn('Skipping OG font glyph check on Vercel because hb-shape is unavailable.')
      process.exit(0)
    }
    throw new Error('hb-shape is required. Install HarfBuzz before checking the OG font.')
  }
  if (result.status !== 0) throw new Error(result.stderr || `Unable to inspect ${font}`)
  if (result.stdout.includes('.notdef')) {
    throw new Error(`Missing OG glyphs in ${font}. Run: yarn update:og-font`)
  }
}

console.log('OG font subsets cover all current social-card text.')
