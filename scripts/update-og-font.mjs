import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectOgFontText } from './og-font-text.mjs'

const root = process.cwd()
const cacheDirectory = path.join(os.tmpdir(), 'myblog-nextjs-og-font')
const sourceFont = path.join(cacheDirectory, 'ChironSungHK.ttf')
const glyphText = path.join(cacheDirectory, 'og-glyphs.txt')
const fontUrl =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/chironsunghk/ChironSungHK%5Bwght%5D.ttf'

function requireCommand(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is required. Install HarfBuzz before updating the OG font.`)
  }
}

async function ensureSourceFont() {
  await fs.mkdir(cacheDirectory, { recursive: true })
  const cached = await fs.stat(sourceFont).catch(() => null)
  if (cached && cached.size > 40_000_000) return

  console.log('Downloading Chiron Sung HK from Google Fonts...')
  const response = await fetch(fontUrl)
  if (!response.ok) throw new Error(`Font download failed: HTTP ${response.status}`)
  await fs.writeFile(sourceFont, Buffer.from(await response.arrayBuffer()))
}

function subset(weight, outputName) {
  const result = spawnSync(
    'hb-subset',
    [
      sourceFont,
      `--text-file=${glyphText}`,
      `--output-file=${path.join(root, 'public/static/fonts', outputName)}`,
      `--variations=wght=${weight}`,
      '--layout-features=*',
      '--name-IDs=*',
      '--name-languages=*',
      '--glyph-names',
    ],
    { encoding: 'utf8' }
  )
  if (result.status !== 0) throw new Error(result.stderr || `hb-subset failed for weight ${weight}`)
}

requireCommand('hb-subset')
await ensureSourceFont()
await fs.writeFile(glyphText, await collectOgFontText(root))
subset(400, 'ChironSungHK-OG-Regular.ttf')
subset(700, 'ChironSungHK-OG-Bold.ttf')
console.log('Updated Chiron Sung HK OG font subsets.')
