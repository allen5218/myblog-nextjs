import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectOgFontText } from './og-font-text.mjs'
import { canSkipMissingHarfBuzz } from './og-font-check-policy.mjs'

const root = process.cwd()
const text = await collectOgFontText(root)
const fonts = ['ChironSungHK-OG-Regular.ttf', 'ChironSungHK-OG-Bold.ttf']

for (const font of fonts) {
  const fontPath = path.join(root, 'public/static/fonts', font)
  const result = spawnSync('hb-shape', [fontPath, text], { encoding: 'utf8', maxBuffer: 10_000_000 })
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
